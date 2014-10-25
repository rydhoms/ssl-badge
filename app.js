var MongoClient = require('mongodb').MongoClient;
var request = require('request');
var cheerio = require('cheerio');
var express = require('express');
var app = express();
var db;


/* Connect to mongo, then start server */
var port = 4333;
MongoClient.connect("mongodb://localhost:27017/sslbadge", function(err, database) {
	if(err) {
		console.log("Cannot connect to db.");
		process.exit(1);
	} else {
		console.log("Connected to db.");
		db = database;
		app.listen(port);
	}
});


// GET sslbadge.org/?domain=example.com
app.get('/', function (req, res) {
	var domain = req.query.domain;

	// GET sslbadge.org/
	if(!domain){
		res.redirect("https://github.com/bergeron/SSL-Badge");
		return;
	}

	/* Do we have a record for this domain? */
	db.collection('domains').find({"domain": domain}).toArray(function(err, items) {
		if(err){
			console.log("Error looking up domain: " + domain);
			res.sendStatus(400); //TODO not this
		} else if(items.length > 1){
			console.log("Found more than 1 record for: " + domain);
			serveBadge(res, items[0].grade);
		} else if(items.length == 1){	/* We have a record for this domain */
			serveBadge(res, items[0].grade);
		} else { /* New domain */
			serveBadge(res, "Calculating");
			addDomain(domain);
		}
	});
});



function serveBadge(res, grade){

	var images = {
		"A+": "http://img.shields.io/badge/SSL-A%2B-brightgreen.svg",
		"A": "http://img.shields.io/badge/SSL-A-brightgreen.svg",
		"A-": "http://img.shields.io/badge/SSL-A---brightgreen.svg",
		"B": "http://img.shields.io/badge/SSL-B-orange.svg",
		"C": "http://img.shields.io/badge/SSL-C-red.svg",
		"F": "http://img.shields.io/badge/SSL-F-red.svg",
		"M": "http://img.shields.io/badge/SSL-M-red.svg",
		"T": "http://img.shields.io/badge/SSL-T-red.svg",
		"Err": "http://img.shields.io/badge/SSL-Err-lightgrey.svg",
		"Calculating": "http://img.shields.io/badge/SSL-Calculating-lightgrey.svg"
	};

	var url = images[grade];
	if(!url){
		url = images['Err'];
	}
	res.redirect(url);
}


/* 
*/
function addDomain(domain, fn){

	db.collection('domains').insert({"domain": domain, "grade": "Calculating"}, function(err, result) {});

	/* Find & set its grade */
	testSSL(domain, function(grade){
		db.collection('domains').update({"domain": domain},{$set: {"grade": grade}}, function(err, result){});
	});
}


/* 	Queries qualys.com SSL checker every intervalMillis until grade is found.
	fn is then called with grade 	*/
function testSSL(domain, fn){

	var url = 'https://www.ssllabs.com/ssltest/clearCache.html?ignoreMismatch=on&d=' + domain;
	var iterations = 0;
	var checkStatus = function(){

		/* Don't try for > 5 minutes (300s) */
		var elapsedTimeSec = (iterations++ * intervalMillis) / 1000;
		if(elapsedTimeSec > 300){
			clearInterval(timer);
			fn("Err");
			return;
		}

		request(url, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var result = parseGrade(body);

				if(result.status == 0){		/* New URL */
					url = result.data;
				} else if(result.status == 1){	/* Waiting */
					/* Waiting... */
				} else if(result.status == 2){	/* Grade found */
					clearInterval(timer);
					var grade = result.data;
					fn(grade);
				}
		  	}
		});
	};

	var intervalMillis = 10000;
	checkStatus(); /* Do it once before waiting intervalMillis */
	var timer = setInterval(checkStatus, intervalMillis);
}


/* 	Scrapes html to find grade
	Returns: {status: int, data: string}
 	Codes: 	0 => Change URL (if Qualys finds multiple servers). data contains the new URL.
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

	/* SSL test failed (invalid domain name, unable to connect to server, 
		no SSL/TLS support, invalid certificate) */
	return {'status': 2, data: "Err"};
	
}
