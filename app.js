var MongoClient = require('mongodb').MongoClient;
var express = require('express');
var request = require('request');
var cheerio = require('cheerio');
var schedule = require('node-schedule');
var bodyParser = require('body-parser');
var crypto = require('crypto');
var base64url = require('base64url');

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
	var domain = req.param("domain");

	// GET sslbadge.org/
	if(!domain){
		res.sendFile(__dirname + "/index.html");
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
	res.setHeader('Etag', base64url(crypto.randomBytes(10)));
	res.setHeader('Pragma', 'no-cache');
	res.setHeader('Expires', 'Sun, 01 Jan 1984 00:00:00 GMT');
	res.setHeader('Cache-Control', 'no-cache');
	res.sendFile(__dirname + file);
}


/* Add new domain to database and find/set its grade */
function addDomain(domain){

	db.collection('domains').insert({"domain": domain, "grade": "Calculating"}, function(err, result) {});

	testSSL(domain, function(grade){
		db.collection('domains').update({"domain": domain},{$set: {"grade": grade}}, function(err, result){});
	});
}

/* 	Queries qualys.com SSL checker until grade is calculated.
	(domain, <callback(grade)>)
*/
function testSSL(domain, callback){

	var intervalSec = 7;
	var maxQueries = 30;
	var url = 'https://www.ssllabs.com/ssltest/clearCache.html?ignoreMismatch=on&d=' + domain;

	/* Query every intervalSec seconds until grade is found or maxQueries reached */
	(function query(iteration){
		if(iteration < maxQueries){
			/* 	Wrapped in fn because we want setTimeout to make the recursive call,
				not pass setTimeout an evaluated function */
			var timer = setTimeout(function(){query(iteration+1);}, intervalSec * 1000);
		}

		request(url, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var result = parseGrade(body);
				console.log(result);

				if(result.status == 0){		/* Update URL */
					url = result.data;
				} else if(result.status == 1){	/* Test still running */
					return;
				} else if(result.status == 2){	/* Grade found */
					clearTimeout(timer);
					var grade = result.data;
					callback(grade);
				}
			} else {
				console.log(error);
			}
		});
	})(0);

}


/* 	Scrapes html to find grade
	Returns: {status: int, data: string}
	Codes: 		0 => Update URL (if Qualys finds multiple servers). data contains the new URL.
			1 => Waiting for test to run. data == "waiting".
			2 => Grade found. data contains the grade.
*/
function parseGrade(html){
	var $ = cheerio.load(html);

	/* Is there a grade on the page yet? Could be in two places */
	var grade1 = $('#rating').find("[class^='rating_']").find('span').html();
	var grade2 = $('#rating').find("[class^='rating_']").html();

	if(grade1){
		return {'status': 2, 'data': grade1};
	} else if(grade2){
		return {'status': 2, 'data': grade2.replace(/[ |\r\n]/g,"")};	/* Delete spaces and '\r\n' */
	}

	/* Multiple servers found. Pick 1st */
	var newURL = $('.ip').first().find('a').attr('href');
	if(newURL){
		return {'status': 0, 'data': 'https://www.ssllabs.com/ssltest/' + newURL};
	}

	/* Waiting for result */
	if(html.indexOf("Please wait") >= 0){
		return {'status': 1, data: "waiting"};
	}

	/* 	SSL test failed (invalid domain name, unable to connect to server, 
		no SSL/TLS support, invalid certificate) */
	return {'status': 2, data: "Err"};
}

function updateGrades(){
	db.collection('domains').find({}).toArray(function(err, items){
		items.forEach(function(d){
			testSSL(d.domain, function(grade){
				db.collection('domains').update({"domain": d.domain},{$set: {"grade": grade}}, function(err, result){});
			});
		});
	});
}
