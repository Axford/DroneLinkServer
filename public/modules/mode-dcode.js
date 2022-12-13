/*

D-Code

*/

ace.define('ace/mode/dcode',
  ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text_highlight_rules'],
  function(acequire, exports, module) {
    'use strict';

    let oop = acequire('../lib/oop');
    let TextHighlightRules = acequire('./text_highlight_rules').TextHighlightRules;

    var DCodeHighlightRules = function() {

        var keywordMapper = this.createKeywordMapper({
            "keyword": "do until node"+
               "",
            "constant.language":
                "true false",
            "constant.other": "OUT0_0 OUT0_1 OUT1_0 OUT1_1 OUT2_0 OUT2_1 DAC0_0 DAC0_1 IN0_0 IN0_1",
        }, "text", true, " ");

        this.$rules = {
            "start" : [
                {token : "entity.function.name", regex : /^\s*\w*\./},
                {token : "keyword", regex : /\$\w+/},
                {token : "string", regex : '\"', next  : "string"},
                {token : "comment.multiline", regex : /^\/\*.+/, next: "comment.multiline"},
                {token : "comment",  regex : /;.+$/},
                {token : "support.class", regex : /\[/, next: "support.class"},
                {token : "constant.numeric", regex: "[+-]?\\d+\\b"},
                {token : keywordMapper, regex : "\\b\\w+\\b"},
                {caseInsensitive: false}
            ],
            "support.class" : [
                {token : "support.class", regex : '\]',     next  : "start"},
                {defaultToken : "support.class"}
            ],
            "comment.multiline" : [
                {token : "comment.multiline", regex : /\*\//,     next  : "start"},
                {defaultToken : "comment.multiline"}
            ],
            "string" : [
                {token : "string", regex : '\"',     next  : "start"},
                {defaultToken : "string"}
            ]
        };
        this.normalizeRules();
    };
    oop.inherits(DCodeHighlightRules, TextHighlightRules);
    exports.DCodeHighlightRules = DCodeHighlightRules;

    //var oop = require("../lib/oop");
    var TextMode = acequire("./text").Mode;
    var CstyleBehaviour = acequire("./behaviour/cstyle").CstyleBehaviour;
    var CStyleFoldMode = acequire("./folding/cstyle").FoldMode;

    var Mode = function() {
      this.HighlightRules = DCodeHighlightRules;
      this.$behaviour = new CstyleBehaviour();
      this.foldingRules = new CStyleFoldMode();
    };
    oop.inherits(Mode, TextMode);

    (function() {
      this.$id = "ace/mode/dcode";
    }).call(Mode.prototype);

    exports.Mode = Mode
  });

/*
define(function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var DCodeHighlightRules = function() {

    var keywordMapper = this.createKeywordMapper({
        "keyword": "do until node"+
           "",
        "constant.language":
            "true false",
        "constant.other": "OUT0_0 OUT0_1 OUT1_0 OUT1_1 OUT2_0 OUT2_1 DAC0_0 DAC0_1 IN0_0 IN0_1",
    }, "text", true, " ");

    this.$rules = {
        "start" : [
            {token : "entity.function.name", regex : /^\s*\w*\./},
            {token : "keyword", regex : /\$\w+/},
            {token : "string", regex : '\"', next  : "string"},
            {token : "comment.multiline", regex : /^\/\*.+/, next: "comment.multiline"},
            {token : "comment",  regex : /\/\/.+$/},
            {token : "support.class", regex : /\[/, next: "support.class"},
            {token : "constant.numeric", regex: "[+-]?\\d+\\b"},
            {token : keywordMapper, regex : "\\b\\w+\\b"},
            {caseInsensitive: false}
        ],
        "support.class" : [
            {token : "support.class", regex : '\]',     next  : "start"},
            {defaultToken : "support.class"}
        ],
        "comment.multiline" : [
            {token : "comment.multiline", regex : /\*\//,     next  : "start"},
            {defaultToken : "comment.multiline"}
        ],
        "string" : [
            {token : "string", regex : '\"',     next  : "start"},
            {defaultToken : "string"}
        ]
    };
};
oop.inherits(DCodeHighlightRules, TextHighlightRules);

exports.DCodeHighlightRules = DCodeHighlightRules;
});
*/
