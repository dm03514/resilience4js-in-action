const resilience4js = require('resilience4js');
const client = require('prom-client');
const express = require('express');

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

const app = express();

const port = 3333;

console.log(resilience4js);

const metrics = resilience4js.Metrics.New();

const bulkhead = resilience4js.Bulkhead.New('http', 10000, metrics);

const prometheusSurfacer = new resilience4js.Metrics.Surfacers.Prometheus(
    metrics,
    {
        http_response: new client.Histogram({
            name: 'http_response',
            labelNames: ['status_code'],
            help: 'metric_help'
        }),
        bulkhead_decorate: new client.Counter({
            name: 'bulkhead_decorate',
            labelNames: ['id'],
            help: 'metric_help'
        }),
        bulkhead_exhausted: new client.Counter({
            name: 'bulkhead_exhausted',
            labelNames: ['id'],
            help: 'metric_help'
        }),
        bulkhead_available_calls: new client.Gauge({
            name: 'bulkhead_available_calls',
            labelNames: ['id'],
            help: 'metric_help'
        }),
        bulkhead_max_calls: new client.Gauge({
            name: 'bulkhead_max_calls',
            labelNames: ['id'],
            help: 'metric_help'
        }),
        bulkhead_utilization: new client.Gauge({
            name: 'bulkhead_utilization',
            labelNames: ['id'],
            help: 'metric_help'
        }),
    }
);
prometheusSurfacer.surface();


function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

class DummyService {
    get() {
        // 99 / 100 times return a good response
        const num = getRandomInt(100);
        if (num === 0) {
            throw new Error('failed');
        }
        return 'success;'
    }
}

const get = (req, res) => {
    const service = new DummyService();
    return new Promise((resolve, _) => {
        resolve(service.get());
    });
};

const wrappedGet = bulkhead.decoratePromise(get);

app.get('/metrics', (req, res) => {
    res.send(client.register.metrics());
});

app.get('/',  (req, res) => {
    const startTime = new Date().getTime();
    let statusCode = 200;

    wrappedGet(req, res)
        .then((val) => {
            res.send(val);
        })
        .catch((err) => {
            statusCode = 429;
            res.status(429);
            res.send({ error: err.message });
        })
        .finally(() => {
            const endTime = new Date().getTime();
            const diff = endTime - startTime;

            metrics.emit({
                event: 'response',
                tags: {
                    status_code: statusCode,
                },
                type: metrics.type.HISTOGRAM,
                value:  diff / 1000,
                component: 'http'
            });
        });
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)
});
