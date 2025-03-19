const express = require('express');
const connectDB = require('./config/db');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const createError = require('http-errors');

dotenv.config();

const app = express();

connectDB();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.post('/api/webhook/stripe', express.raw({type: 'application/json'}), (req, res) => {
  const webhookModule = require('./routes/api/webhook');
  return webhookModule.stripe(req, res);
});

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Define Routes
// app.use('/', indexRouter);
// app.use('/users', usersRouter);
app.use('/api/auth', require('./routes/api/auth'));
app.use('/api/profile', require('./routes/api/profile'));
app.use('/api/classes', require('./routes/api/classes'));
app.use('/api/trainers', require('./routes/api/trainers'));
app.use('/api/bookings', require('./routes/api/bookings'));
app.use('/api/recommendations', require('./routes/api/recommendations'));
app.use('/api/payments', require('./routes/api/payments'));

app.get('/', (req, res) => {
  res.send('API Running');
});

app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
