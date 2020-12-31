const log = require('./log.js');

module.exports = {
    logLevel: log.INFO,

    password: '#######',
    username: '#######',

    sendMail: false,
    sendMailFrom: '######',
    sendMailTo: '######',

    cpsAuthDomain: 'https://oauth.parkplus.ca',
    cpsLogin: '/signin',
    cpsAuth: '/signin/authenticate',
    cpsOauthGet: '/oauth/authorize?response_type=token&client_id=eps-client&redirect_uri=https://cpa.permit.calgaryparking.com',
    cpsApiDomain: 'https://www.myparkingservices.com/api/'
};
