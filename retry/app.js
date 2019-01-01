const resilience4js = require('resilience4js');
const client = require('prom-client');
const express = require('express');

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

const app = express();

const port = 3000;

console.log(resilience4js);

const metrics = resilience4js.Metrics.New();

const retry = resilience4js.Retry.New(
    'dummy_service',
    resilience4js.Retry.Strategies.UntilLimit.New(
        resilience4js.Retry.Timing.FixedInterval.New(50),
        1,
        metrics,
    ),
    metrics,
);

const prometheusSurfacer = new resilience4js.Metrics.Surfacers.Prometheus(
    metrics,
    {
        http_response: new client.Histogram({
            name: 'http_response',
            labelNames: ['status_code'],
            help: 'metric_help'
        }),
        retry_shouldretry: new client.Counter({
            name: 'retry_shouldretry',
            labelNames: ['strategy', 'doretry'],
            help: 'metric_help'
        }),
        retry_attempt: new client.Counter({
            name: 'retry_attempt',
            labelNames: ['strategy', 'number'],
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
        return new Promise((resolve, reject) => {
            // 99 / 100 times return a good response
            const num = getRandomInt(100);
            if (num === 0) {
                reject(new Error('failed'));
            }
            resolve('success');
        });
    }
}

const get = (req, res) => {
    const service = new DummyService();
    const wrappedGet = retry.decoratePromise(service.get);
    return new Promise((resolve, reject) => {
        setTimeout(resolve, 50);
    }).then(() => {
        return wrappedGet();
    })
};

app.get('/metrics', (req, res) => {
    res.send(client.register.metrics());
});

app.get('/',  (req, res) => {
    const startTime = new Date().getTime();
    let statusCode = 200;

    get(req, res)
        .then((val) => {
            res.send(val);
        })
        .catch((err) => {
            if (err.message === 'failed') {
                statusCode = 503;
                res.status(statusCode);
                res.send({ error: err.message });
            } else {
                throw err;
            }
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
