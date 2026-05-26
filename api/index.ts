import app from '../server';

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

export default app;
