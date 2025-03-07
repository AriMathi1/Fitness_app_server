const express = require('express');
const connectDB = require('./config/db');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const createError = require('http-errors');

// Load environment variables
dotenv.config();

// var indexRouter = require('./routes/index');
// var usersRouter = require('./routes/users');

// Create Express app
const app = express();

// Connect to database
connectDB();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use('/api/webhook', require('./routes/api/webhook'));

// Middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors()); // Enable CORS for client requests
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

// Root route
app.get('/', (req, res) => {
  res.send('API Running');
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
