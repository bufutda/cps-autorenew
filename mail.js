const fs = require('fs');
const child_process = require('child_process');

const conf = require('./conf.js');
const log = require('./log.js');

module.exports = function (updates, error) {
    log.info('Sending update email');

    let sucStr = 'SUCCESS';
    if (error) {
        sucStr = 'FAILED';
    }

    let now = new Date().toLocaleString().toUpperCase();

    let rows = [];
    for (let update of updates) {
        rows.push(`<tr><td>${update.plate}</td><td style="font-family: monospace">${new Date(update.from).toLocaleString().toUpperCase()}</td><td style="font-family: monospace">${new Date(update.to).toLocaleString().toUpperCase()}</td></tr>`);
    }

    fs.writeFile('/tmp/cps-autorenew_mail.mail', `From: "Parking Renewal Script" <${conf.sendMailFrom}>
To: ${conf.sendMailTo}
Subject: [SCRIPT] Parking Renewal Update ${sucStr}
Content-Type: text/html

<html>
    <head>
    </head>
    <body>
        <h3>Script run ${now} ${sucStr}</h3>
        <table style="border: 1px solid black;" border="1" border-color="black">
            <thead>
                <tr>
                    <th>Plate</th><th style="font-family: monospace">Start</th><th style="font-family: monospace">End</th>
                </tr>
            <tbody>
                ${rows.join('\n')}
            </tbody>
        </table>
<pre>
${error || ''}
</pre>
    </body>
</html>`, (err) => {
        if (err) {
            throw err;
        }

        log.debug('File written');

        child_process.exec(`cat /tmp/cps-autorenew_mail.mail | msmtp -a default ${conf.sendMailFrom}`, (err, stdout, stderr) => {
            if (err) {
                throw err;
            }
            log.info('Mail sent.');
        });
    });
};
