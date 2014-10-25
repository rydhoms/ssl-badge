SSL-Badge
=========

### www.sslbadge.org

[![SSL Rating](http://sslbadge.org/?domain=test)](https://www.ssllabs.com/ssltest/analyze.html?d=ephemeral.pw)

SSL-Badge is a service that displays your website's SSL/TLS rating (according to [Qualys Labs](https://www.ssllabs.com/ssltest/)) as a badge.


### Grades

![A+](http://img.shields.io/badge/SSL-A%2B-brightgreen.svg)
![A](http://img.shields.io/badge/SSL-A-brightgreen.svg)
![A-](http://img.shields.io/badge/SSL-A---brightgreen.svg)
![B](http://img.shields.io/badge/SSL-B-orange.svg)
![C](http://img.shields.io/badge/SSL-C-red.svg)
![F](http://img.shields.io/badge/SSL-F-red.svg)
![M](http://img.shields.io/badge/SSL-M-red.svg)
![T](http://img.shields.io/badge/SSL-T-red.svg)
![Err](http://img.shields.io/badge/SSL-Err-lightgrey.svg)
![Calculating](http://img.shields.io/badge/SSL-Calculating-lightgrey.svg)

### Usage

Generate the markdown at [sslbadge.org](http://sslbadge.org).  Your badge will say ![Calculating](http://img.shields.io/badge/SSL-Calculating-lightgrey.svg) if its your first time requesting your domain's badge.  Github aggressively caches images in markdown, so badge updates may be delayed a few minutes.  Grades are recalculated every 24 hours at 3 am EST.  Clicking the badge opens a detailed report from Qualys Labs.


### Why?

Certificates expire, server configurations change, and protocols become insecure. SSL-Badge helps you keep an eye on security without explicitly retesting your SSL/TLS configuration.
