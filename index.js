process.once("uncaughtException", function (e) {
    try {
        log.error(e);
    } catch (err) {
        console.error(e);
    }
    process.exit(1);
});

const request = require('request');
const jsdom = require('jsdom');

const conf = require('./conf.js');
const log = require('./log.js');
const mail = require('./mail.js');

log.setLevel(conf.logLevel);
log.info('Starting...');
let jar = request.jar();
let updates = [];

function scrapejsdom() {
    jsdom.JSDOM.fromURL(`${conf.cpsAuthDomain}${conf.cpsLogin}`).then((dom) => {
        log.debug('Scraping login page for csrf token');
        let csrf = dom.window.document.querySelector('#signin [name="_csrf"]');
        log.debug(`_csrf: ${csrf.value}`);
        cookies = dom.cookieJar.toJSON().cookies;
        for (let cookie of cookies) {
            if (cookie.key === 'SESSION') {
                log.debug(`session: ${cookie.value}`);
                sendAuthReq(csrf.value, cookie.value);
                break;
            }
        }
    }).catch((e) => {
        throw e;
    });
};

function sendAuthReq (csrf, session) {
    log.info('Sending authentication requests...');
    log.debug(`Using CSRF: ${csrf[0]}`);
    log.debug(`Using session: ${session}`);

    request({
        url: `${conf.cpsAuthDomain}${conf.cpsAuth}?_csrf=${csrf}&username=${conf.username}&password=${conf.password}&login-submit=Sign%20In`,
        method: 'POST',
        headers: {
            'Origin': 'https://oauth.parkplus.ca',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36',
            'Referer': 'https://oauth.parkplus.ca/signin',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': `SESSION=${session}`
        },
        jar: jar
    }, (err, response, body) => {
        if (err) {
            throw err;
        }

        log.debug(`Auth came back ${response.statusCode}`);

        if (response.statusCode !== 302) {
            throw new Error(`Authentication request came back ${response.statusCode}`);
        }

        log.debug(`Sending auth2 to ${conf.cpsAuthDomain}${conf.cpsOauthGet}`);
        request({
            url: `${conf.cpsAuthDomain}${conf.cpsOauthGet}`,
            jar: jar,
            method: 'GET'
        }, (err, response, body) => {
            if (err) {
                throw err;
            }

            log.debug(`Auth2 came back ${response.statusCode}`);
            let url = response.request.uri.hash.substr(1);
            let auth = {};
            for (let pair of url.split('&')) {
                let keyvalue = pair.split('=');
                if (keyvalue.length !== 2) {
                    throw new Error('Malformed kvpair: ' + pair);
                }
                auth[decodeURIComponent(keyvalue[0])] = decodeURIComponent(keyvalue[1]);
            }

            log.debug('Using OAUTH:', auth);
            _getApi(auth.access_token, 'login', apiCredentials => {
                log.info('Authenticated.');
                log.debug(`Retrieved usable API token: ${apiCredentials.rtoken}`);
                getAddresses(apiCredentials.rtoken);
            })
        });
    });
}

function _getApi (auth, path, cb) {
    request({
        method: 'GET',
        url: `${conf.cpsApiDomain}${path}`,
        headers: {
            Authorization: `Bearer ${auth}`
        },
    }, (err, response, body) => {
        if (err) {
            throw err;
        }
        log.debug(`GET ${conf.cpsApiDomain}${path} came back ${response.statusCode}`);
        if (response.statusCode !== 200) {
            throw new Error(`API call came back ${response.statusCode}\n${body}`);
        }

        try {
            body = JSON.parse(body);
        } catch (e) {
            throw new Error(`${conf.cpsApiDomain}${path} didn't return JSON: ${body}`);
        }

        cb(body);
    });
}

function _postAPI (auth, path, data, cb) {
    request({
        method: 'POST',
        url: `${conf.cpsApiDomain}${path}`,
        headers: {
            Authorization: `Bearer ${auth}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }, (err, response, body) => {
        if (err) {
            throw err;
        }
        log.debug(`POST ${conf.cpsApiDomain}${path} came back ${response.statusCode}`);
        if (response.statusCode !== 200) {
            throw new Error(`API call came back ${response.statusCode}\n${body}`);
        }

        try {
            body = JSON.parse(body);
        } catch (e) {
            throw new Error(`${conf.cpsApiDomain}${path} didn't return JSON: ${body}`);
        }

        cb(body);
    });
}

function getAddresses (auth) {
    log.info('Getting addresses...');
    _getApi(auth, 'permits/addresses', addresses => {
        let keyedAddresses = {};
        let addressIDs = [];
        for (let address of addresses) {
            keyedAddresses[address.id] = address;
            if (addressIDs.indexOf(address.id) === -1) {
                addressIDs.push(address.id);
            }
        }

        function process (i) {
            let addressID = addressIDs[i];

            if (!addressID) {
                log.info('Done!');
                if (conf.sendMail) {
                    mail(updates);
                }
                return;
            }

            log.info(`Processing address: ${keyedAddresses[addressID].address}`);
            log.debug(`Address is ${addressID}`);
            log.indent();

            getPermits(auth, addressID, () => {
                log.dedent();
                process(++i);
            });
        }

        process(0);
    });
}

function getPermits (auth, address, cb) {
    log.info('Getting permits...');
    _getApi(auth, `permits?addressId=${address}`, permits => {
        function processPermit(i) {
            let permit = permits[i];
            if (!permit) {
                cb();
                return;
            }

            log.info(`Processing permit ${permit.permitNumber}`);
            log.indent();

            function processSession (j) {
                let session = permit.parkingSessions[j];
                if (!session) {
                    log.dedent();
                    processPermit(++i);
                    return;
                }

                if (session.permit.permitType.code !== 'VP') {
                    log.info(`[${session.licensePlate}] Aborting: session is not visitor`);
                    processSession(++j);
                    return;
                } else {
                    log.info(`[${session.licensePlate}] From ${new Date(session.activationDateTime)} to ${new Date(session.deactivationDateTime)}`);
                    log.indent();
                    log.debug('Cancelling permit...');
                    _postAPI(auth, `parkingsessions?action=stop`, {
                        id: session.id
                    }, () => {
                        log.debug('Starting new permit...');
                        _postAPI(auth, `parkingsessions?action=start`, {
                            licensePlate: session.licensePlate,
                            permit: {
                                id: session.permit.id
                            },
                            province: {
                                id: session.permit.address.province.id
                            }
                        }, newSession => {
                            log.info(`Renewed session: [${newSession.licensePlate}] From ${new Date(newSession.activationDateTime)} to ${new Date(newSession.deactivationDateTime)}`);
                            updates.push({
                                plate: newSession.licensePlate,
                                from: newSession.activationDateTime,
                                to: newSession.deactivationDateTime
                            });
                            log.dedent();
                            processSession(++j);
                        });
                    });
                }
            }
            processSession(0);
        }
        processPermit(0);
    });
}

// scrapejsdom();
mail([
    {
        plate: 'BPM3650',
        from: '2018-03-19T06:02:48.348Z',
        to: '2018-03-19T06:03:48.348Z'
    },
    {
        plate: 'BGL4101',
        from: '2018-03-19T06:02:48.348Z',
        to: '2018-03-19T06:03:48.348Z'
    }
]);
