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

False.makeLambdaItem = function (astNode) {
  return { type: 'lambda', astNode: astNode };
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

False.popInteger = function () {
  var stack = False.stack;
  if (stack.length == 0) {
    return False.makeError('empty stack' );
  }
  var item = False.pop();
  if (item.type === 'integer') {
    return item.value;
  }
  if (item.type === 'boolean') {
    return item.value ? -1 : 0;
  }
  if (item.type === 'character') {
    return item.value.charCodeAt(0);
  }
  stack.push(item);
  return False.makeError('invalid type: ' + item.type);
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
      } else if (descriptor === lexical.value.character) {
        False.push(False.makeCharacterItem(astNode.string));
      } else {  // Must be a string.
        False.push(False.makeStringItem(astNode.string));
      }
      continue;
    }
    // variable: wrap the variable name in a stack item
    if (category === 'variable') {
      False.push(False.makeVariableItem(astNode.string));
      continue;
    }
    // If no other category matched, we must be dealing with an operator.
    // Pop the required items off thestack and perform the operation.
    var symbol = astNode.string;
    console.log('Let\'s perform an operation: ' + symbol);
    if (descriptor === operator.arithmetic) {         // + - *  / _
      var b = False.popInteger();
      if (False.isError(b)) {
        return b;
      }
      if (symbol == '_') {
        False.push(False.makeIntegerItem(-b));
        continue;
      }
      var a = False.popInteger();
      if (False.isError(a)) {
        return a;
      }
      if (symbol == '+') {
        False.push(False.makeIntegerItem(a + b));
      }
      if (symbol == '-') {
        False.push(False.makeIntegerItem(a - b));
      }
      if (symbol == '*') {
        False.push(False.makeIntegerItem(a * b));
      }
      if (symbol == '/') {
        if (b === 0) {
          return False.makeError('division by zero: ' + a + ' / ' + b);
        }
        var ratio = a / b,
            result = (ratio < 0 ? Math.ceil : Math.floor)(ratio);
        False.push(False.makeIntegerItem(result));
      }
    } else if (descriptor === operator.comparison) {  // = >
    } else if (descriptor === operator.logical) {     // & | ~
    } else if (descriptor === operator.variable) {    // : ;
    } else if (descriptor === operator.stack) {       // $ % \ @ ø
    } else if (descriptor === operator.control) {     // ? #
    } else if (descriptor === operator.io) {          // . , ^ ß
    } else if (descriptor === operator.lambda) {      // !
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

False.push = function (item) {
  // Push the item onto the logical stack.
  False.stack.push(item);
  // Display a string in the physical stack.
  var type = item.type,
      representation = (type === 'lambda' ? item.astNode.string : item.value);
  var container = document.createElement('div');
  container.className = 'item';
  container.innerHTML = representation;
  item.container = container;
  False.container.stack.appendChild(container);
};

False.pop = function () {
  if (False.stack.length == 0) {
    return False.makeError('the stack is empty');
  }
  var item = False.stack.pop();
  False.container.stack.removeChild(item.container);
  item.container = undefined;
  return item;
};

False.error = function (message) {
  False.errorMessage(message);
  False.crash = true;
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

False.makeInteger = function (intValue) {
  return { type: False.types.integer, value: intValue };
};
False.makeCharacter = function (charValue) {
  return { type: False.types.character, value: charValue };
};
False.makeBoolean = function (boolValue) {
  return { type: False.types.boolean, value: boolValue };
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
  False.clearStack();
  False.clearMessages();

  // Scan: characters -> tokens
  False.message('scanning');
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
  False.message('parsing');
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
  sourceInput.value = '1 1 +';
  False.run();
  runButton.onclick = False.run;
};
