'use strict';

var _ = require('lodash');
var argv = require('yargs').argv;
var gulp = require('gulp');
var replace = require('gulp-replace');
var connect = require('gulp-connect');
var webpack = require('webpack');
var webpackStream = require('webpack-stream');
var webpackConfig = require('./webpack.conf');
var helpers = require('./gulpHelpers');
var prebid = require('./package.json');

var port = 9999;

gulp.task('relevant-devpack', function () {
  var cloned = _.cloneDeep(webpackConfig);
  cloned.devtool = 'source-map';
  var externalModules = helpers.getArgModules();

  let moduleSources = helpers.getModulePaths(externalModules);
  if(externalModules.length) {
    moduleSources = moduleSources.filter((p) => {
      const match = externalModules.find(e => ~p.indexOf(`modules/${e}`));
      return match;
    });
  }

  return gulp.src([].concat(moduleSources, 'src/relevant/relevantWorker.js'))
    .pipe(helpers.nameModules(externalModules))
    .pipe(webpackStream(cloned, webpack))
    .pipe(replace('$prebid.version$', prebid.version))
    .pipe(gulp.dest('build/dev'))
    .pipe(connect.reload());
});

gulp.task('relevant-build-bundle-dev', gulp.series('relevant-devpack', gulp.__gulpBundle.bind(null, true)));

gulp.task('relevant-watch', function () {
  gulp.watch([
    'src/**/*.js',
    'modules/**/*.js',
    'test/spec/**/*.js',
    '!test/spec/loaders/**/*.js'
  ], gulp.series('relevant-build-bundle-dev'));
  gulp.watch([
    'loaders/**/*.js',
    'test/spec/loaders/**/*.js'
  ], gulp.series('lint'));
  connect.server({
    https: argv.https,
    port: port,
    root: './',
    livereload: true
  });
});

gulp.task('relevant-serve', gulp.series('relevant-build-bundle-dev', 'relevant-watch'));
