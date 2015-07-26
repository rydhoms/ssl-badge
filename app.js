var MongoClient = require('mongodb').MongoClient;
var express = require('express');
var request = require('request');
var cheerio = require('cheerio');
var schedule = require('node-schedule');
var bodyParser = require('body-parser');

var crypto = require('crypto');
var querystring = require('querystring');

var db;
var port = 4333;
var app = express();
app.use(bodyParser.urlencoded({extended: true}));

/* Connect to mongo, then start server */
MongoClient.connect("mongodb://localhost:27017/sslbadge", function(err, database) {
	if(err) {
		console.log("Cannot connect to db.");
		process.exit(1);
	} else {
		console.log("Connected to db.");
		db = database;
		app.listen(port);

		/* Re-grade every 24 hours @ 3am */
		var updater = new schedule.RecurrenceRule();
		updater.hour = 3;
		schedule.scheduleJob(updater, updateGrades);
	}
});


// GET sslbadge.org/?domain=example.com
app.get('/', function (req, res) {
	var domain = req.query.domain;

	// GET sslbadge.org/
	if(!domain){
		res.sendFile(__dirname + '/index.html');
		return;
	}

	/* Do we have a grade for this domain? */
	db.collection('domains').find({"domain": domain}).toArray(function(err, items) {
		if(err){
			console.log("Error looking up domain: " + domain);
			serveBadge(res, "Err");
		} else if(items.length > 1){
			console.log("Found more than 1 record for: " + domain);
			serveBadge(res, items[0].grade);
		} else if(items.length == 1){	/* We have a grade for this domain */
			serveBadge(res, items[0].grade);
		} else { /* New domain */
			serveBadge(res, "Calculating");
			addDomain(domain);
		}
	});
});

/* Generate markdown */
app.post('/generate', function (req, res) {
	var domain = req.body.domain;
	var md = "[![SSL Rating](http://sslbadge.org/?domain=" + domain + ")](https://www.ssllabs.com/ssltest/analyze.html?d=" + domain + ")";
	res.send(md);
});

function serveBadge(res, grade){
	var images = {
		"A+": "/badges/aplus.svg",
		"A": "/badges/a.svg",
		"A-": "/badges/aminus.svg",
		"B": "/badges/b.svg",
		"C": "/badges/c.svg",
		"F": "/badges/f.svg",
		"M": "/badges/m.svg",
		"T": "/badges/t.svg",
		"Err": "/badges/err.svg",
		"Calculating": "/badges/calculating.svg"
	};

	var file = images[grade] || images["Err"];

	/* PLEASE don't cache this */
	res.setHeader('Etag', crypto.randomBytes(10).toString('hex'));
	res.setHeader('Pragma', 'no-cache');
	res.setHeader('Expires', 'Sun, 01 Jan 1984 00:00:00 GMT');
	res.setHeader('Cache-Control', 'no-cache');
	res.sendFile(__dirname + file);
}


/* Add new domain to database and find/set its grade */
function addDomain(domain){

	db.collection('domains').insert({"domain": domain, "grade": "Calculating"}, function(err, result) {});

	testSSL(domain, 0, function(grade){
		db.collection('domains').update({"domain": domain},{$set: {"grade": grade}}, function(err, result){});
	});
}

/* 	Queries SSL Labs API until grade is calculated.
	(domain, <callback(grade)>)
*/
function testSSL(domain, iter, callback){

	if(iter > maxPolls){
		return;
	}

	var pollIntervalMs = 10000;
	var maxPolls = 40;
	var endpoint = 'https://api.ssllabs.com/api/v2/analyze/?';

	var req = {
		'host': domain
	}

	var qs = endpoint + querystring.stringify(req);
	console.log('GET ' + qs);

	request(qs, function (error, response, body) {
			if (!error && response.statusCode == 200) {

				var data = JSON.parse(body);

				if(data.endpoints && data.endpoints[0] && data.endpoints[0].grade){
					callback(data.endpoints[0].grade);
				} else if(data.status == 'READY' || data.status == 'ERROR'){
					callback('Err');
				} else{
					callback('Calculating');
					setTimeout(function(){testSSL(domain, iter+1, callback);}, pollIntervalMs);
				}
			}
		});
}

function updateGrades(){
	db.collection('domains').find({}).toArray(function(err, items){
		items.forEach(function(d){
			testSSL(d.domain, 0, function(grade){
				db.collection('domains').update({"domain": d.domain},{$set: {"grade": grade}}, function(err, result){});
			});
		});
	});
}
