var False = {};

False.lexical = {
  value: {
    integer: 'integer value',
    character: 'character value',
    string: 'string value'
  },
  variable: {
    name: 'variable name'
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
  delimiter: {
    lambda: {
      open: 'open lambda',
      close: 'close lambda'
    },
    string: {
      open: 'open string',
      close: 'close string'
    }
  },
  comment: 'comment', 
  error: {
    character: 'character error',
    string: 'string error',
    comment: 'comment error',
    invalid: 'invalid'
  }
};

// Prepare dictionaries that help with tokenizing and parsing.
(function () {
  // Map characters to token descriptors.
  var lexical = False.lexical,
      lookup = False.lookup = {},
      operator = lexical.operator,
      delimiter = lexical.delimiter;
  function fill(s, name) {
    s.split('').forEach(function (ch) {
      lookup[ch] = name;
    });
  }
  fill('+-*/_', operator.arithmetic);
  fill('=>', operator.comparison);
  fill('&|~', operator.logical);
  fill(':;', operator.variable);
  fill('$%\\@ø', operator.stack);
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
  range('a', 'z', lexical.variable.name);

  // Map token descriptors to token category hierarchy.
  var categoryOf = False.categoryOf = {};
  function descend(group, levels) {
    Object.keys(group).forEach(function (key) {
      var item = group[key];
      levels.push(key);
      if (typeof(item) === 'string') {
        categoryOf[item] = levels.slice();
      } else {
        descend(item, levels);
      }
      levels.pop();
    });
  }
  descend(lexical, []);

  // Decide which tokens will be retained for parsing.
  var parseToken = False.parseToken = {};
  ['value', 'variable', 'operator'].forEach(function (category) {
    parseToken[category] = true;
  });
})();

False.makeToken = function (descriptor, begin, end) {
  return { descriptor: descriptor, begin: begin, end: end };
};

False.makeScanError = function (token, message) {
  return { token: token, message: message };
};

False.scan = function (s) {
  var result = {},
      tokens = result.tokens = [],
      errors = result.errors = [],
      makeToken = False.makeToken,
      makeScanError = False.makeScanError,
      lexical = False.lexical,
      lookup = False.lookup,
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
      tokens.push(makeToken(lookupResult, pos - 1, pos));
      continue;
    }

    // Sequence of digits: integer value.
    if (/[0-9]/.test(ch)) {
      var seek = pos;
      while (seek < s.length && /[0-9]/.test(s.charAt(seek))) {
        ++seek;
      }
      tokens.push(makeToken(lexical.value.integer, pos - 1, seek));
      pos = seek;
      continue;
    }

    // Single quote followed by any character: character value.
    if (ch == "'") {
      if (pos < s.length) {
        tokens.push(makeToken(lexical.value.character, pos, pos + 1));
        ++pos;
        continue;
      } else {
        tokens.push(makeToken(lexical.error.character, pos - 1, pos));
        errors.push(makeScanError(tokens[tokens.length - 1],
            'missing character'));
        break;
      } 
    }

    // Double-quoted character sequence: string.
    if (ch == '"') {
      var seek = pos;
      while (true) {
        if (seek == s.length) {
          tokens.push(makeToken(lexical.error.string, pos - 1, seek));
          errors.push(makeScanError(tokens[tokens.length - 1],
              'string not terminated'));
          pos = seek;
          break;
        }
        ch = s.charAt(seek);
        ++seek;
        // Check for an escaped double quote.
        if (ch == '\\' && seek < s.length && s.charAt(seek) == '"') {
          ++seek;
          continue;
        }
        // Check for the end of the string.
        if (ch == '"') {
          // Discard the delimiters when we make the token.
          tokens.push(makeToken(lexical.value.string, pos, seek - 1));
          pos = seek;
          break;
        }
      }
      continue;
    }

    // Left brace + any characters except right brace + right brace: comment.
    // Note that comments cannot be nested.
    if (ch == '{') {
      var seek = pos;
      while (true) {
        if (seek == s.length) {
          tokens.push(makeToken(lexical.error.comment, pos - 1, seek));
          errors.push(makeScanError(tokens[tokens.length - 1],
              'comment not terminated'));
          pos = seek;
          break;
        }
        ch = s.charAt(seek);
        ++seek;
        if (ch == '}') {
          tokens.push(makeToken(lexical.comment, pos - 1, seek));
          pos = seek;
          break;
        }
      }
      continue;
    }

    // If we didn't recognize the character, it's a syntax error.
    tokens.push(makeToken(lexical.error.invalid, pos - 1, pos));
    errors.push(makeScanError(tokens[tokens.length - 1],
        'invalid code'));
  }
  return result;
};

False.makeParseError = function (pos, message) {
  return { pos: pos, message: message };
};

False.doParse = function (errors, tokens, startLambda) {
  var lexical = False.lexical,
      categoryOf = False.categoryOf,
      parseToken = False.parseToken,
      pos = startLambda || 0,
      tree = {
        category: (startLambda ? 'lambda' : 'program'),
        beginToken: (startLambda ? pos - 1 : pos),
      },
      children = tree.children = [],
      makeParseError = False.makeParseError,
      delimiter = lexical.delimiter.lambda;
  while (true) {
    if (pos == tokens.length) {  // We've run out of tokens.
      tree.endToken = pos;
      if (startLambda !== undefined) {  // We are inside a lambda function.
        errors.push(makeParseError(tree.beginToken,
            'lambda function not closed'));
      }
      break;
    }
    if (tokens[pos].descriptor === delimiter.close) {  // Close lambda.
      if (startLambda === undefined) {  // We are not in a lambda function.
        errors.push(makeParseError(pos, 'unexpected lambda delimiter'));
        ++pos;
        continue;  // Skip the token and continue parsing.
      }
      tree.endToken = pos + 1;
      break;
    }
    var descriptor = tokens[pos].descriptor;
    if (descriptor === delimiter.open) {  // Descend into a lambda function.
      var lambda = False.doParse(errors, tokens, pos + 1);
      children.push(lambda);  // The lambda is a child of the current tree.
      pos = lambda.endToken;
      continue;
    }
    // If the token is meaningful, add it as a child.
    var category = categoryOf[descriptor][0];
    if (parseToken[category]) {
      var node = {
        category: category,
        token: tokens[pos],
        string: False.sourceCode.substring(tokens[pos].begin, tokens[pos].end)
      };
      children.push(node);
    }
    ++pos;
  }
  tree.string = False.sourceCode.substring(
      tokens[tree.beginToken].begin, tokens[tree.endToken - 1].end);
  return tree;
};

False.parse = function (tokens) {
  var errors = [],
      tree = False.doParse(errors, tokens);
  return { tree: tree, errors: errors };
};

False.displayParseTree = function (tree, tabs) {
  tabs = tabs || [];
  var indent = tabs.join('');
  console.log(indent + tree.category + ': token ' + tree.beginToken +
      ' to token ' + tree.endToken);
  tabs.push('    ');
  tree.children.forEach(function (child) {
    if (child.category === 'lambda') {
      console.log(child.category);
      False.displayParseTree(child, tabs);
    } else {
      var token = child.token;
      console.log(indent + child.category + ', ' + token.descriptor + ', ' +
          'character ' + token.begin + ' to character ' + token.end);
    }
  });
  tabs.pop();
};

False.highlight = function(token) {
  sourceInput.selectionStart = token.begin;
  sourceInput.selectionEnd = token.end;
};

False.copyItem = function (item) {
  return { type: item.type, value: item.value };
};
False.makeLambdaItem = function (astNode) {
  return { type: 'lambda', value: astNode };
};
False.makeIntegerItem = function (x) {
  return { type: 'integer', value: x };
};
False.makeBooleanItem = function (b) {
  return { type: 'boolean', value: b };
}
False.makeCharacterItem = function (ch) {
  return { type: 'character', value: ch };
};
False.makeStringItem = function (s) {
  return { type: 'string', value: s };
};
False.makeVariableItem = function (name) {
  return { type: 'variable', value: name };
};

False.toInteger = function (item) {
  if (item.type === 'integer') {
    return item.value;
  }
  if (item.type === 'boolean') {
    return item.value ? -1 : 0;
  }
  if (item.type === 'character') {
    return item.value.charCodeAt(0);
  }
  return False.makeError("can't get integer from " + item.type);
};
False.toBoolean = function (item) {
  if (item.type === 'integer') {
    if (item.value != -1 && item.value != 0) {
      return False.makeError("can't get character from " + item.value);
    }
    return item.value === 0 ? false : true;
  }
  if (item.type === 'boolean') {
    return item.value;
  }
  if (item.type === 'character') {
    if (item.value.charCodeAt(0) === 0) {
      return false;
    }
    return False.makeError("can't get boolean from " + item.value);
  }
  return False.makeError("can't get boolean from " + item.type);
};
False.toCharacter = function (item) {
  if (item.type === 'integer') {
    if (item.value < 0 || item.value > 65535) {
      return False.makeError("can't get character from " + item.value);
    }
    return String.fromCharCode(item.value);
  }
  if (item.type === 'boolean') {
    if (item.value) {
      return False.makeError("can't get character from true boolean value");
    }
    return String.fromCharCode(0);
  }
  if (item.type === 'character') {
    return item.value;
  }
  return False.makeError("can't get character from " + item.type);
};

False.makeError = function (message) {
  return { error: message };
};
False.isError = function (result) {
  return typeof(result) === 'object' && result.error !== undefined;
};

False.execute = function (abstractSyntaxTree) {
  var lexical = False.lexical,
      operator = lexical.operator,
      children = abstractSyntaxTree.children;
  for (var i = 0; i < children.length; ++i) {
    var astNode = children[i];
    // Categories: program, lambda, value, variable, operator.
    // program will never appear as a child node
    var category = astNode.category;
    // lambda: wrap the AST sub-tree in a stack item
    if (category === 'lambda') {
      False.push(False.makeLambdaItem(astNode));
      continue;
    }
    var token = astNode.token,
        descriptor = token.descriptor;
    console.log(category, JSON.stringify(token));
    // value: turn the literal into a value and wrap it in a stack item
    if (category === 'value') {
      if (descriptor === lexical.value.integer) {
        False.push(False.makeIntegerItem(parseInt(astNode.string, 10)));
        continue;
      }
      if (descriptor === lexical.value.character) {
        False.push(False.makeCharacterItem(astNode.string));
        continue;
      }
      if (descriptor === lexical.value.string) {
        False.push(False.makeStringItem(astNode.string));
        continue;
      }
    }
    // variable: wrap the variable name in a stack item
    if (category === 'variable') {
      False.push(False.makeVariableItem(astNode.string));
      continue;
    }
    // If no other category matched, we must be dealing with an operator.
    // Pop the required items off thestack and perform the operation.
    var symbol = astNode.string;
    console.log('operator: ' + symbol);
    if (descriptor === operator.arithmetic) {         // _ + - *  /
      var b = False.toInteger(False.pop());
      if (False.isError(b)) {
        return b;
      }
      if (symbol == '_') {
        False.push(False.makeIntegerItem(-b));
        continue;
      }
      var a = False.toInteger(False.pop());
      if (False.isError(a)) {
        return a;
      }
      if (symbol == '+') {
        False.push(False.makeIntegerItem(a + b));
        continue;
      }
      if (symbol == '-') {
        False.push(False.makeIntegerItem(a - b));
        continue;
      }
      if (symbol == '*') {
        False.push(False.makeIntegerItem(a * b));
        continue;
      }
      if (symbol == '/') {
        if (b === 0) {
          return False.makeError('division by zero: ' + a + ' / ' + b);
        }
        var ratio = a / b,
            result = (ratio < 0 ? Math.ceil : Math.floor)(ratio);
        False.push(False.makeIntegerItem(result));
        continue;
      }
    }
    if (descriptor === operator.comparison) {  // = >
      var b = False.toInteger(False.pop());
      if (False.isError(b)) {
        return b;
      }
      var a = False.toInteger(False.pop());
      if (False.isError(a)) {
        return a;
      }
      var result = (symbol == '=' ? (a === b) : (a < b));
      False.push(False.makeBooleanItem(result));
      continue;
    }
    if (descriptor === operator.logical) {     // ~ & |
      var b = False.toBoolean(False.pop());
      if (False.isError(b)) {
        return b;
      }
      if (symbol == '~') {
        False.push(False.makeBooleanItem(!b));
        continue;
      }
      var a = False.toBoolean(False.pop());
      if (False.isError(a)) {
        return a;
      }
      if (symbol == '&') {
        False.push(False.makeBooleanItem(a && b));
        continue;
      }
      if (symbol == '|') {
        False.push(False.makeBooleanItem(a || b));
        continue;
      }
    }
    if (descriptor === operator.variable) {    // ; :
      var item = False.peek();
      if (False.isError(item)) {
        return item;
      }
      if (item.type != 'variable') {
        return False.makeError('expected a variable');
      }
      var name = item.value;
      if (symbol == ';') {  // Retrieve from variable.
        var item = False.retrieve(name);
        if (False.isError(item)) {
          return item;
        }
        False.pop();
        False.push(item);
        continue;
      }
      if (symbol == ':') {  // Store to variable.
        var item = False.peek(1);
        if (False.isError(item)) {
          return item;
        }
        var outcome = False.store(name, item);
        if (False.isError(outcome)) {
          return outcome;
        }
        False.pop();
        False.pop();
        continue;
      }
    }
    if (descriptor === operator.stack) {       // $ % \ @ ø
      if (symbol == '$') {  // duplicate
        var item = False.peek();
        if (False.isError(item)) {
          return item;
        }
        False.push(False.copyItem(item));
        continue;
      }
      if (symbol == '%') {  // drop
        var outcome = False.pop();
        if (False.isError(outcome)) {
          return outcome;
        }
        continue;
      }
      if (symbol == '\\') {  // swap
        var b = False.pop();
        if (False.isError(b)) {
          return b;
        }
        var a = False.pop();
        if (False.isError(a)) {
          return a;
        }
        False.push(b);
        False.push(a);
        continue;
      }
      if (symbol == '@') {  // rotate
        var c = False.pop();
        if (False.isError(c)) {
          return c;
        }
        var b = False.pop();
        if (False.isError(b)) {
          return b;
        }
        var a = False.pop();
        if (False.isError(a)) {
          return a;
        }
        False.push(b);
        False.push(c);
        False.push(a);
        continue;
      }
      if (symbol == 'ø') {  // pick: copy nth item (zero-based)
        var n = False.toInteger(False.pop());
        if (False.isError(n)) {
          return n;
        }
        var item = False.peek(n);
        if (False.isError(item)) {
          False.push(False.makeIntegerItem(n));
          return item;
        }
        False.push(False.copyItem(item));
        continue;
      }
    }
    if (descriptor === operator.control) {     // ? #
    }
    if (descriptor === operator.io) {          // . , ^ ß
    }
    if (descriptor === operator.lambda) {      // !
    }
  }
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

False.toString = function (item) {
  if (item.type === 'lambda') {
    return item.value.string;
  }
  return item.value;
};

False.push = function (item) {
  // Push the item onto the logical stack.
  False.stack.push(item);
  // Display a string in the physical stack.
  var type = item.type,
      container = document.createElement('div');
  container.className = 'item';
  container.innerHTML = '<span class="type">' + type + '</span>' +
      '<span class="value">' + False.toString(item) + '</span>';
  item.container = container;
  False.container.stack.appendChild(container);
};

False.pop = function () {
  if (False.stack.length == 0) {
    return False.makeError('empty stack');
  }
  var item = False.stack.pop();
  False.container.stack.removeChild(item.container);
  item.container = undefined;
  return item;
};

False.peek = function (fromTop) {
  fromTop = fromTop || 0;
  if (fromTop < 0 || fromTop >= False.stack.length) {
    return False.makeError('out of stack');
  }
  return False.stack[False.stack.length - 1 - fromTop];
};

False.store = function (name, item) {
  var info = False.variables[name];
  if (info === undefined) {
    return False.makeError('invalid variable name ' + name);
  }
  // Assume that info is { container: variable, span: { value: valueSpan } }
  // Logical storage.
  info.item = item;
  // Physical representation.
  info.container.className = 'variable';
  info.span.value.innerHTML = False.toString(item);
};

False.retrieve = function (name) {
  var info = False.variables[name];
  if (info === undefined) {
    return False.makeError('invalid variable name ' + name);
  }
  var item = info.item;
  if (item === undefined) {
    return False.makeError('nothing stored in variable ' + name);
  }
  return False.copyItem(item);
};

False.errorMessage = function (s) {
  False.message(s, 'error');
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

False.run = function () {
  False.clearStack();
  False.clearMessages();

  // Scan: characters -> tokens
  console.log('scanning');
  var sourceCode = False.sourceCode = False.sourceInput.value,
      scanResult = False.scan(sourceCode);
  if (scanResult.errors.length != 0) {
    scanResult.errors.forEach(function (error) {
      var token = error.token,
          text = sourceCode.substring(token.begin, token.end);
      if (text.length > 20) {
        text = text.substring(0, 20) + '...';
      }
      False.errorMessage('[char ' + token.begin + '] ' + error.message +
          ': ' + text);
    });
    return;
  }

  function displayToken(token) {
    console.log(JSON.stringify(token), '>' + sourceCode.substring(token.begin, token.end) + '<');
  }
  
  // Parse: tokens -> parse tree
  console.log('parsing');
  var tokens = scanResult.tokens,
      parseResult = False.parse(tokens);
  if (parseResult.errors.length != 0) {
    parseResult.errors.forEach(function (error) {
      var token = tokens[error.pos],
          text = sourceCode.substring(token.begin, token.end);
      if (text.length > 20) {
        text = text.substring(0, 20) + '...';
      }
      False.errorMessage('[char ' + token.begin + '] ' + error.message +
          ': ' + text);
    });
    return;
  }

  // Evaluate: parse tree -> output
  //False.displayParseTree(parseResult.tree);
  False.message('executing');
  var executeResult = False.execute(parseResult.tree);
  if (False.isError(executeResult)) {
    False.errorMessage(executeResult.error);
    return;
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
  /*
  sourceInput.value = '{ Conversation. }\n' +
      '"\\"Hello there.\\""\n"\\"Hi.\\""\n'+
      '{ Exeunt. }';
  sourceInput.value = "99 9[1-$][\$@$@$@$@\/*=[1-$$[%\1-$@]?0=[\$.' ,\]?]?]#";
  sourceInput.value = "[\$@$@\/+2/]r: [127r;!r;!r;!r;!r;!r;!r;!\%]s: 2000000s;!";
  sourceInput.value = "[[$' =][%^]#]b:" +
      "[$$'.=\' =|~]w:" +
      "[$'.=~[' ,]?]s:" +
      "[w;![^o;!\,]?]o:" +
      "^b;![$'.=~][w;[,^]#b;!s;!o;!b;!s;!]#,";
  sourceInput.value = '[$0=["no more bottles"]?$1=["One bottle"]?$1>[$.' +
    '" bottles"]?%" of beer"]b:' +
    '100[$0>][$b;!" on the wall, "$b;!".' +
    '"1-"Take one down, pass it around, "$b;!" on the wall.\n"]#%';
  */
  sourceInput.value = '[ 1 + ] f:\n2 f; !';
  sourceInput.value = '1 a: a; a; + $  a; + a; \\ @';
  sourceInput.value = '7 8 9 [ 1 + ] ! 0 ø';
  False.run();
  runButton.onclick = False.run;
};
