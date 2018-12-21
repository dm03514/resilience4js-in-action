const resilience4js = require('resilience4js');
const express = require('express');
const app = express();
const port = 3000;
var StatsD = require('hot-shots');

const client = new StatsD({port: 8125});

console.log(resilience4js);

const metrics = resilience4js.Metrics.New();

const bulkhead = new resilience4js.Bulkhead('http', 10, metrics);

const statsdSurfacer = new resilience4js.Metrics.Surfacers.StatsD(
    metrics,
    client
);
statsdSurfacer.surface();

metrics.subscribe(console.log);

const get = (req, res) => {
    return new Promise((resolve, _) => {
        setTimeout(() => {
            resolve('hi');
        }, 500);
    });
};

const wrappedGet = bulkhead.decoratePromise(get);

app.get('/', (req, res) => {
    wrappedGet(req, res)
    .then((val) => {
        res.send(val);
    })
    .catch((err) => {
        console.log(err);
        res.status(429);
        res.send({ error: err.message });
    });
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)
});
