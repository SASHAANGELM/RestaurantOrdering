import express from 'express';

const app = express();

app.disable('x-powered-by');
app.get('/api', (_request, response) => {
  response.json({ name: 'Restaurant Ordering API' });
});

app.listen(3000, '127.0.0.1', () => {
  console.info('Restaurant Ordering API listening on http://127.0.0.1:3000/api');
});
