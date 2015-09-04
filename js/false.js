var False = {};

False.token = {
  value: {
    integer: 'integer value',
    character: 'character value',
    string: 'string value'
  },
  operator: {
    arithmetic: 'arithmetic operator',
    comparison: 'comparison operator',
    logical: 'logical operator',
    variable: 'variable operator',
    stack: 'stack operator',
    control: 'control operator',
    io: 'I/O operator',
    lambda: 'lambda operator'
  },
  variable: {
    name: 'variable name'
  },
  delimiter: {
    lambda: {
      open: 'open lambda',
      close: 'close lambda'
    },
    string: {
      open: 'open string',
      close: 'close string'
    }
  }
};

(function () {
  var token = False.token,
      lookup = token.lookup = {},
      operator = token.operator,
      delimiter = token.delimiter;
  function fill(s, name) {
    s.split('').forEach(function (ch) {
      lookup[ch] = name;
    });
  }
  fill('+-*/_', operator.arithmetic);
  fill('=<', operator.comparison);
  fill('&|~', operator.logical);
  fill(':;', operator.variable);
  fill('$%\@ø', operator.stack);
  fill('?#', operator.control);
  fill('.,^ß', operator.io);
  fill('[', delimiter.lambda.open);
  fill(']', delimiter.lambda.close);
  fill('!', operator.lambda);
  function range(firstChar, lastChar, name) {
    var last = lastChar.charCodeAt(0);
    for (var i = firstChar.charCodeAt(0); i <= last; ++i) {
      lookup[String.fromCharCode(i)] = name;
    }
  }
  range('a', 'z', token.variable.name);
})();

False.makeToken = function (category, begin, s) {
  return { category: category, begin: begin, text: s };
};

False.tokenize = function (s) {
  var result = {},
      tokens = result.tokens = [],
      makeToken = False.makeToken,
      error = function (begin, end, message) {
        result.error = { begin: begin, end: end, message: message };
        return result;
      },
      token = False.token,
      lookup = token.lookup,
      pos = 0;
  while (pos < s.length) {
    var ch = s.charAt(pos);
    ++pos;
    if (/\s/.test(ch)) {
      continue;
    }

    // Single character: operator, lambda delimiter, or variable name.
    var lookupResult = lookup[ch];
    if (lookupResult !== undefined) {
      tokens.push(makeToken(lookupResult, pos - 1, ch));
      continue;
    }

    // Sequence of digits: integer value.
    if (/[0-9]/.test(ch)) {
      var seek = pos;
      while (seek < s.length && /[0-9]/.test(s.charAt(seek))) {
        ++seek;
      }
      tokens.push(makeToken(token.value.integer, pos - 1,
          s.substring(pos - 1, seek)));
      pos = seek;
      continue;
    }

    // Single quote followed by any character: character value.
    if (ch == "'") {
      if (pos < s.length) {
        tokens.push(makeToken(token.value.character, pos, s.charAt(pos)));
        ++pos;
        continue;
      } else {
        return error(pos - 1, pos, 'missing character');
      } 
    }

    // Double-quoted character sequence: string.
    // This is a double quote inside a string: \"
    // This is a slash at the end of a string: \\
    if (ch == '"') {
      var seek = pos;
      while (seek < s.length) {
        ch = s.charAt(seek);
        ++seek;
        if (ch == '"') {
          // Note that we are stripping the string delimiters.
          tokens.push(makeToken(token.value.string, pos,
              s.substring(pos, seek - 1)));
          pos = seek;
          break;
        }
      }
      continue;
    }

    // Left brace + any characters except right brace + right brace: comment.
    // Note that comments cannot be nested.
    if (ch == '{') {
    }
  }
  return result;
};

False.highlightCode = function (begin, end) {
  console.log('highlight', begin, end);
};

False.parse = function (tokens) {
  return {};
};

False.evaluate = function (parseTree) {
};

False.removeChildren = function (container) {
  var children = container.children;
  for (var i = children.length - 1; i >= 0; --i) {
    container.removeChild(children[i]);
  }
};

False.clearStack = function () {
  False.stack = [];
  False.removeChildren(False.container.stack);
};

False.push = function (item) {
  False.stack.push(item);
  var container = document.createElement('div');
  container.className = 'item';
  container.innerHTML = '<span class="type">' + item.type + '</span>' +
      ' <span class="value">' + item.value + '</span>';
  item.container = container;
  False.container.stack.appendChild(container);
};

False.pop = function () {
  if (False.stack.length == 0) {
    False.error('the stack is empty');
  } else {
    var item = False.stack.pop();
    False.container.stack.removeChild(item.container);
    return item;
  }
};

False.error = function (s) {
  False.message('error: ' + s, 'error');
  False.crash = true;
};

False.clearMessages = function () {
  False.removeChildren(False.container.output);
};

False.message = function (s, classExtra) {
  var container = document.createElement('div');
  container.className = 'message ' + (classExtra || undefined);
  container.innerHTML = s;
  False.container.output.appendChild(container);
};

False.makeInteger = function (intValue) {
  return { type: False.types.integer, value: intValue };
};
False.makeCharacter = function (charValue) {
  return { type: False.types.character, value: charValue };
};
False.makeBoolean = function (boolValue) {
  return { type: False.types.boolean, value: boolValue };
};

False.getIntegerValue = function (item) {
  if (typeof(item) != 'object' || item.type != False.types.integer) {
    False.error('expected an integer');
  } else {
    return item.value;
  }
};
False.getBooleanValue = function (item) {
  if (typeof(item) != 'object' || item.type != False.types.boolean) {
    False.error('expected a boolean');
  } else {
    return item.value;
  }
};

False.processToken = function (token) {

  // Integer value.
  if (/^[0-9]$/.test(token)) {
    False.push(False.makeInteger(parseInt(token, 10)));
    return;
  }

  // Character value.
  if (/^'[A-Z]$/.test(token)) {
    False.push(False.makeCharacter(token.charAt(1)));
    return;
  }

  // Arithmetic operators.
  if (token.length == 1 && '+-*/_=>'.indexOf(token) != -1) {
    var b = False.getIntegerValue(False.pop());
    if (token == '_') {
      False.push(False.makeInteger(-b));
      return;
    }
    var a = False.getIntegerValue(False.pop());
    if (token == '+') {
      False.push(False.makeInteger(a + b));
    } else if (token == '-') {
      False.push(False.makeInteger(a - b));
    } else if (token == '*') {
      False.push(False.makeInteger(a * b));
    } else if (token == '/') {
      var ratio = a / b,
          result = (ratio < 0 ? Math.ceil : Math.floor)(ratio);
      False.push(False.makeInteger(result));
    } else if (token == '=') {
      False.push(False.makeBoolean(a === b));
    } else if (token == '>') {
      False.push(False.makeBoolean(a > b));
    }
    return;
  }

  // Logical operators.
  if (token.length == 1 && '&|~'.indexOf(token) != -1) {
    var b = False.getBooleanValue(False.pop());
    if (token == '~') {
      False.push(False.makeBoolean(!b));
      return;
    }
    var a = False.getBooleanValue(False.pop());
    if (token == '&') {
      False.push(False.makeBoolean(a & b));
    } else if (token == '-') {
      False.push(False.makeInteger(a | b));
    }
    return;
  }

  // Inequality operator.
  if (token == '=~') {
    var b = False.pop(), a = False.pop();
    // Check for strict equality.
    if (a.type === b.type && a.value === b.value) {
      False.push(False.makeBoolean(false));
      return;
    }
    // Coerce characters to integers.
    if (a.type === False.types.character) {
      a.type = 'integer';
      a.value = a.value.charCodeAt(0);
    }
    if (b.type === False.types.character) {
      b.type = 'integer';
      b.value = b.value.charCodeAt(0);
    }
    False.push(False.makeBoolean(a.type !== b.type || a.value !== b.value));
    return;
  }

  // Variable assignment.
  if (/^[a-z]:$/.test(token)) {
    var name = token.charAt(0),
        variable = False.variables[name];
    variable.value = False.pop();
    variable.span.value.innerHTML = variable.value.value;
    variable.container.className = 'variable';
    return;
  }

  // Variable evaluation.
  if (/^[a-z];$/.test(token)) {
    var name = token.charAt(0),
        variable = False.variables[name];
    False.push(variable.value);
    return;
  }

  // Function definition.
  if (token == '[') {
    // Now we would have to scan ahead. Hm.
  }

  
  // Function evaluation.

  False.error('invalid token "' + token + '"');
};

False.run = function () {
  False.clearMessages();
  False.message('running');
  False.clearStack();
  False.error = undefined;

  // Tokenize: characters -> tokens
  var result = False.tokenize(False.sourceInput.value),
      error = result.error;
  if (error) {
    False.highlightCode(error.begin, error.end);
    console.log('parse error: ' + error.message);
    return;
  }
  var tokens = result.tokens;
  tokens.forEach(function (token) {
    console.log(token);
  });
  
  return;
  
  // Parse: tokens -> parse tree
  var parseTree = False.parse(tokens);

  // Evaluate: parse tree -> output
  False.evaluate(parseTree);

  // Trim whitespace from ends.
  source = source.replace(/^\s+|\s$/g, '');
  // Discard line-terminating characters.
  source = source.replace(/\s/g, ' ');
  var tokens = source.split(/\s+/);

  for (var tokenIx = 0; tokenIx < tokens.length; ++tokenIx) {
    var token = tokens[tokenIx];
    console.log('token ' + tokenIx + ': ' + token);
    False.processToken(token);
    if (False.crash) {
      console.log('crashed');
      break;
    }
  }
  False.message('done');
};

window.onload = function () {
  False.container = {};
  False.container.variables = document.getElementById('variables');
  var a = 'a'.charCodeAt(0),
      z = 'z'.charCodeAt(0);
  False.variables = {};
  for (var i = a; i <= z; ++i) {
    var ch = String.fromCharCode(i),
        variable = document.createElement('div');
    variable.className = 'variable unused';
    var nameSpan = document.createElement('span'),
        valueSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.innerHTML = ch;
    valueSpan.className = 'value';
    variable.appendChild(nameSpan);
    variable.appendChild(valueSpan);
    False.container.variables.appendChild(variable);
    False.variables[ch] = { container: variable, span: { value: valueSpan } };
  }
  False.container.output = document.getElementById('output');
  False.container.stack = document.getElementById('stack');
  var sourceInput = False.sourceInput = document.getElementById('sourceInput'),
      runButton = document.getElementById('runButton');
  //sourceInput.value = "99 9[1-$][\$@$@$@$@\/*=[1-$$[%\1-$@]?0=[\$.' ,\]?]?]#";
  //sourceInput.value = "[\$@$@\/+2/]r: [127r;!r;!r;!r;!r;!r;!r;!\%]s: 2000000s;!";
  /*
  sourceInput.value = "[[$' =][%^]#]b:" +
      "[$$'.=\' =|~]w:" +
      "[$'.=~[' ,]?]s:" +
      "[w;![^o;!\,]?]o:" +
      "^b;![$'.=~][w;[,^]#b;!s;!o;!b;!s;!]#,";
  */
  sourceInput.value = '[$0=["no more bottles"]?$1=["One bottle"]?$1>[$.' +
    '" bottles"]?%" of beer"]b:' +
    '100[$0>][$b;!" on the wall, "$b;!".' +
    '"1-"Take one down, pass it around, "$b;!" on the wall.\n"]#%';
  False.run();
  runButton.onclick = False.run;
};
