'use strict';
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var yeoman = require('yeoman-generator');
var _s = require('underscore.string');
var mkdirp = require('mkdirp');
var Manifest = require('chrome-manifest');

var metadata = new Manifest.queryMetadata({
  channel: 'stable',
  extensionTypes: ['extension']
});

module.exports = yeoman.generators.Base.extend({
  constructor: function (args, options, config) {
    var testLocal;

    yeoman.generators.Base.apply(this, arguments);

    // preapre options
    this.option('test-framework', {
      desc: 'Test framework to be invoked',
      type: String,
      defaults: 'mocha'
    });

    this.option('babel', {
      type: Boolean,
      defaults: true,
      desc: 'Compile ES2015 using Babel'
    });

    this.option('compass', {
      desc: 'Use Compass',
      type: Boolean,
      defaults: false
    });

    // load package
    this.pkg = require('../package.json');

    // set source root path to templates
    this.sourceRoot(path.join(__dirname, 'templates'));

    // init extension manifest data
    this.manifest = {
      permissions:{}
    };

    this.srcScript = 'app/scripts' + (this.options.babel ? '.babel/' : '/');

    if (this.options['test-framework'] === 'mocha') {
      testLocal = require.resolve('generator-mocha/generators/app/index.js');
    } else if (this.options['test-framework'] === 'jasmine') {
      testLocal = require.resolve('generator-jasmine/generators/app/index.js');
    }

    this.composeWith(this.options['test-framework'] + ':app', {
      options: {
        'skip-install': this.options['skip-install']
      }
    }, {
      local: testLocal
    });

    // copy source files to scripts or scripts.babel
    this.copyjs = function copyjs(src, dest) {
      if (!dest) {
        dest = src;
      }

      this.fs.copyTpl(
        this.templatePath('scripts/' + src),
        this.destinationPath(this.srcScript + dest),
        {
          babel: this.options.babel
        }
      );
    };
  },

  askFor: function (argument) {
    var cb = this.async();

    var prompts = [
      {
        name: 'name',
        message: 'What would you like to call this extension?',
        default: (this.appname) ? this.appname : 'myChromeApp'
      },
      {
        name: 'description',
        message: 'How would you like to describe this extension?',
        default: 'My Chrome Extension'
      },
      {
        type: 'list',
        name: 'action',
        message: 'Would you like to use UI Action?',
        choices:[
          'No',
          'Browser',
          'Page'
        ]
      },
      {
        type: 'checkbox',
        name: 'uifeatures',
        message: 'Would you like more UI Features?',
        choices: [{
          value: 'options',
          name: 'Options Page',
          checked: false
        }, {
          value: 'contentscript',
          name: 'Content Scripts',
          checked: false
        }, {
          value: 'omnibox',
          name: 'Omnibox',
          checked: false
        }]
      },
      {
        type: 'checkbox',
        name: 'permissions',
        message: 'Would you like to use permissions?',
        choices: Object.keys(metadata.permissions).map(function(permission) {
          return {
            value: permission,
            name: permission,
            checked: false
          };
        })
      }
    ];

    this.prompt( prompts , function(answers) {
      var isChecked = function (choices, value) { return choices.indexOf(value) > -1; };

      this.appname = this.manifest.name = answers.name.replace(/\"/g, '\\"');
      this.manifest.description = answers.description.replace(/\"/g, '\\"');
      this.manifest.action = (answers.action === 'No') ? 0 : (answers.action === 'Browser') ? 1 : 2;
      this.manifest.options = isChecked(answers.uifeatures, 'options');
      this.manifest.omnibox = isChecked(answers.uifeatures, 'omnibox');
      this.manifest.contentscript = isChecked(answers.uifeatures, 'contentscript');
      this.manifest.permissions = answers.permissions.reduce(function(result, permission) {
        result[permission] = true;
        return result;
      }, {});

      cb();
    }.bind(this));
  },

  app: function () {
    mkdirp('app');
    mkdirp('app/bower_components');
  },

  gruntfile: function () {
    this.fs.copyTpl(
      this.templatePath('Gruntfile.js'),
      this.destinationPath('Gruntfile.js'),
      {
        name: this.appname,
        pkg: this.pkg,
        manifest: this.manifest,
        babel: this.options.babel,
        testFramework: this.options['test-framework'],
        compass: this.options.compass
      }
    );
  },

  packageJSON: function () {
    this.fs.copyTpl(
      this.templatePath('_package.json'),
      this.destinationPath('package.json'),
      {
        name: _s.slugify(this.appname),
        babel: this.options.babel,
        testFramework: this.options['test-framework'],
        compass: this.options.compass
      }
    );
  },

  git: function () {
    this.fs.copyTpl(
      this.templatePath('gitignore'),
      this.destinationPath('.gitignore'),
      {
        babel: this.options.babel
      }
    );

    this.fs.copy(
      this.templatePath('gitattributes'),
      this.destinationPath('.gitattributes')
    );
  },

  bower: function () {
    this.copy('bowerrc', '.bowerrc');
    this.fs.copyTpl(
      this.templatePath('_bower.json'),
      this.destinationPath('bower.json'),
      {
        name: _s.slugify(this.appname)
      }
    );
  },

  jshint: function () {
    this.fs.copyTpl(
      this.templatePath('jshintrc'),
      this.destinationPath('.jshintrc'),
      {
        testFramework: this.options['test-framework']
      }
    );
  },

  editorConfig: function () {
    this.fs.copy(
      this.templatePath('editorconfig'),
      this.destinationPath('.editorconfig')
    );
  },

  manifest: function () {
    var manifest = {};
    var permissions = [];
    var items = [];

    // add browser / page action field
    if (this.manifest.action > 0) {
      var action = {
        default_icon: { 19: 'images/icon-19.png', 38: 'images/icon-38.png' },
        default_title: this.manifest.name,
        default_popup: 'popup.html'
      };
      var title = (this.manifest.action === 1) ? 'browser_action' : 'page_action';
      manifest[title] = JSON.stringify(action, null, 2).replace(/\n/g, '\n  ');
    }

    // add options page field.
    if (this.manifest.options) {
      var options_ui = {
        page: 'options.html',
        chrome_style: true
      };
      manifest.options_page = '"options.html"';
      manifest.options_ui = JSON.stringify(options_ui, null, 2).replace(/\n/g, '\n  ');
    }

    // add omnibox keyword field.
    if (this.manifest.omnibox) {
      manifest.omnibox = JSON.stringify({ keyword: this.manifest.name }, null, 2).replace(/\n/g, '\n  ');
    }

    // add contentscript field.
    if (this.manifest.contentscript) {
      var contentscript = [{
        matches: ['http://*/*', 'https://*/*'],
        js: ['scripts/contentscript.js'],
        run_at: 'document_end',
        all_frames: false
      }];

      manifest.content_scripts = JSON.stringify(contentscript, null, 2).replace(/\n/g, '\n  ');
    }

    // add generate permission field.
    for (var p in this.manifest.permissions) {
      if (this.manifest.permissions[p]) {
        permissions.push(p);
      }
    }

    // add generic match pattern field.
    if (this.manifest.permissions.tabs) {
      permissions.push('http://*/*');
      permissions.push('https://*/*');
    }

    if (permissions.length > 0) {
      manifest.permissions = JSON.stringify(permissions, null, 2).replace(/\n/g, '\n  ');
    }

    for (var i in manifest) {
      items.push(['  "', i, '": ', manifest[i]].join(''));
    }

    this.manifest.items = (items.length > 0) ? ',\n' + items.join(',\n') : '';

    this.fs.copyTpl(
      this.templatePath('manifest.json'),
      this.destinationPath('app/manifest.json'),
      this.manifest
    );
  },

  actions: function () {
    if (this.manifest.action === 0) {
      return;
    }

    this.fs.copy(
      this.templatePath('popup.html'),
      this.destinationPath('app/popup.html')
    );

    this.copyjs('popup.js');

    this.fs.copy(
      this.templatePath('images/icon-19.png'),
      this.destinationPath('app/images/icon-19.png')
    );

    this.fs.copy(
      this.templatePath('images/icon-38.png'),
      this.destinationPath('app/images/icon-38.png')
    );
  },

  eventpage: function () {
    var backgroundjs = 'background.js';

    if (this.manifest.action === 2) {
      backgroundjs = 'background.pageaction.js';
    } else if (this.manifest.action === 1) {
      backgroundjs = 'background.browseraction.js';
    }

    this.copyjs(backgroundjs, 'background.js');
    this.copyjs('chromereload.js');
  },

  options: function () {
    if (!this.manifest.options) {
      return;
    }

    this.fs.copy(
      this.templatePath('options.html'),
      this.destinationPath('app/options.html')
    );

    this.copyjs('options.js');
  },

  contentscript: function () {
    if (!this.manifest.contentscript) {
      return;
    }

    this.copyjs('contentscript.js');
  },

  babel: function () {
    if (!this.options.babel) {
      return;
    }

    this.fs.copy(
      this.templatePath('babelrc'),
      this.destinationPath('.babelrc')
    );
  },

  mainStylesheet: function () {
    if (this.manifest.action === 0 && !this.manifest.options) {
      return;
    }

    var css = 'styles/main.' + (this.compass ? 's' : '') + 'css';

    this.fs.copy(
      this.templatePath(css),
      this.destinationPath('app/' + css)
    );
  },

  assets: function () {
    this.fs.copyTpl(
      this.templatePath('_locales/en/messages.json'),
      this.destinationPath('app/_locales/en/messages.json'),
      this.manifest
    );

    this.fs.copy(
      this.templatePath('images/icon-16.png'),
      this.destinationPath('app/images/icon-16.png')
    );

    this.fs.copy(
      this.templatePath('images/icon-128.png'),
      this.destinationPath('app/images/icon-128.png')
    );
  },

  install: function () {
    if (!this.options['skip-install']) {
      this.installDependencies({
        skipMessage: this.options['skip-install-message'],
        skipInstall: this.options['skip-install']
      });
    }
  }
});
