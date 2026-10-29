/**
 * Tree-sitter grammar for Viso `.vs` files, after Appendix A of the Viso DSL
 * specification. It is the editors' grammar: it shapes a file for
 * highlighting, folding, indentation and outlines, and accepts some programs
 * the compiler rejects. Diagnostics come from viso-lsp.
 */

const PREC = {
  closure: -1,
  range: 1,
  coalesce: 2,
  or: 3,
  and: 4,
  compare: 5,
  bitor: 6,
  bitxor: 7,
  bitand: 8,
  shift: 9,
  additive: 10,
  multiplicative: 11,
  cast: 12,
  unary: 13,
  postfix: 14,
  path: 15,
};

const UNITS = ["dp", "px", "sp", "em", "ns", "us", "ms", "s", "min", "deg", "rad", "turn", "hz", "khz"];

const commaSep = (rule) => optional(seq(rule, repeat(seq(",", rule)), optional(",")));
const commaSep1 = (rule) => seq(rule, repeat(seq(",", rule)), optional(","));

module.exports = grammar({
  name: "viso",

  word: ($) => $.identifier,

  extras: ($) => [/\s/, $.line_comment, $.doc_comment, $.block_comment],

  supertypes: ($) => [$._expression, $._declaration, $._pattern, $._type],

  conflicts: ($) => [
    [$.identifier_pattern],
    [$.binding_pattern],
    [$._type_segment, $.start_statement],
    [$._expression, $.record_expression],
    [$.path],
    [$._pattern, $._expression],
    [$.identifier_pattern, $._expression],
    [$.block, $.record_expression],
    [$.if_statement, $.if_expression],
    [$.match_statement, $.match_expression],
  ],

  rules: {
    source_file: ($) => repeat(choice($.import_declaration, $._top_level)),

    // --- Comments -----------------------------------------------------------

    line_comment: (_) => token(seq("//", optional(/[^/!\n][^\n]*/))),
    doc_comment: (_) => token(choice(seq("///", /[^\n]*/), seq("//!", /[^\n]*/))),
    block_comment: (_) => token(seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")),

    // --- Imports and declarations -----------------------------------------

    import_declaration: ($) =>
      seq(
        "import",
        $.identifier,
        repeat(seq("::", $.identifier)),
        optional(
          choice(
            seq("as", field("alias", $.identifier)),
            seq("::", "{", commaSep1($.import_item), "}"),
          ),
        ),
        ";",
      ),
    module_path: ($) => prec.right(seq($.identifier, repeat(seq("::", $.identifier)))),
    import_item: ($) => seq(field("name", $.identifier), optional(seq("as", field("alias", $.identifier)))),

    _top_level: ($) => seq(repeat($.attribute), optional("export"), $._declaration),

    _declaration: ($) =>
      choice(
        $.component_declaration,
        $.system_declaration,
        $.record_declaration,
        $.enum_declaration,
        $.trait_declaration,
        $.impl_declaration,
        $.type_alias,
        $.const_declaration,
        $.function_declaration,
        $.template_declaration,
        $.style_declaration,
        $.theme_declaration,
        $.shader_declaration,
        $.native_declaration,
      ),

    attribute: ($) =>
      prec.right(
        seq(
          "@",
          field("name", seq($.identifier, repeat(seq("::", $.identifier)))),
          optional(seq("(", commaSep(choice($.named_argument, $._expression)), ")")),
        ),
      ),

    // --- Types ------------------------------------------------------------

    _type: ($) =>
      choice($.function_type, $.tuple_type, $.array_type, $.slice_type, $.trait_object_type, $.self_type, $.type_path),

    type_path: ($) =>
      prec.right(
        seq(
          $._type_segment,
          repeat(seq("::", $._type_segment)),
        ),
      ),
    _type_segment: ($) =>
      prec.right(seq(field("name", alias($.identifier, $.type_identifier)), optional($.generic_arguments))),
    generic_arguments: ($) => seq("<", commaSep1(choice($._type, seq("const", $._expression))), ">"),
    generic_parameters: ($) =>
      seq(
        "<",
        commaSep1(
          choice(
            seq(field("name", $.identifier), optional(seq(":", $.trait_bounds)), optional(seq("=", $._type))),
            seq("const", field("name", $.identifier), ":", $._type, optional(seq("=", $._expression))),
          ),
        ),
        ">",
      ),
    trait_bounds: ($) => prec.left(seq($.type_path, repeat(seq("+", $.type_path)))),
    implements_clause: ($) => seq("implements", $.trait_bounds),
    where_clause: ($) => seq("where", commaSep1(seq($._type, ":", $.trait_bounds))),
    function_type: ($) =>
      seq(choice("Fn", "FnMut", "ActionFn", "TaskFn"), "(", commaSep($._type), ")", "->", $._type),
    tuple_type: ($) => seq("(", $._type, ",", commaSep($._type), ")"),
    array_type: ($) => seq("[", $._type, ";", $._expression, "]"),
    slice_type: ($) => seq("[", $._type, "]"),
    trait_object_type: ($) => seq("dyn", $.trait_bounds),
    self_type: (_) => "Self",

    // --- Records, enums, traits, impls ------------------------------------

    record_declaration: ($) =>
      seq(
        "record",
        field("name", $.identifier),
        optional($.generic_parameters),
        optional($.implements_clause),
        optional($.where_clause),
        field("body", $.field_list),
      ),
    field_list: ($) => seq("{", repeat($.record_field), "}"),
    record_field: ($) =>
      seq(
        repeat($.attribute),
        field("name", $.identifier),
        ":",
        field("type", $._type),
        optional(seq("=", $._expression)),
        ";",
      ),
    enum_declaration: ($) =>
      seq(
        "enum",
        field("name", $.identifier),
        optional($.generic_parameters),
        optional($.implements_clause),
        optional($.where_clause),
        "{",
        repeat($.enum_variant),
        "}",
      ),
    enum_variant: ($) =>
      seq(
        repeat($.attribute),
        field("name", $.identifier),
        optional(choice(seq("(", commaSep($._type), ")"), $.field_list)),
        ";",
      ),
    trait_declaration: ($) =>
      seq(
        "trait",
        field("name", $.identifier),
        optional($.generic_parameters),
        optional(seq(":", $.trait_bounds)),
        optional($.where_clause),
        $.declaration_list,
      ),
    impl_declaration: ($) =>
      seq(
        "impl",
        optional($.generic_parameters),
        field("trait", optional(seq($.type_path, "for"))),
        field("type", $._type),
        optional($.where_clause),
        $.declaration_list,
      ),
    declaration_list: ($) =>
      seq(
        "{",
        repeat(
          seq(
            repeat($.attribute),
            choice($.function_declaration, $.associated_type, $.const_declaration),
          ),
        ),
        "}",
      ),
    associated_type: ($) =>
      seq("type", field("name", $.identifier), optional(seq(":", $.trait_bounds)), optional(seq("=", $._type)), ";"),
    type_alias: ($) =>
      seq("type", field("name", $.identifier), optional($.generic_parameters), "=", field("type", $._type), ";"),
    const_declaration: ($) =>
      seq(
        "const",
        field("name", $.identifier),
        ":",
        field("type", $._type),
        optional(seq("=", field("value", $._expression))),
        ";",
      ),

    // --- Callables ---------------------------------------------------------

    function_declaration: ($) =>
      seq(
        field("kind", choice("fn", "action", "task")),
        field("name", $.identifier),
        optional($.generic_parameters),
        field("parameters", $.parameters),
        optional(seq("->", field("return_type", $._type))),
        optional($.where_clause),
        optional($.capability_clause),
        choice(field("body", $.block), ";"),
      ),
    parameters: ($) => seq("(", commaSep(choice($.self_parameter, $.parameter)), ")"),
    self_parameter: ($) => seq(optional("mut"), $.self, optional(seq(":", $._type))),
    parameter: ($) =>
      seq(
        optional("mut"),
        field("name", $.identifier),
        ":",
        field("type", $._type),
        optional(seq("=", field("default", $._expression))),
      ),
    capability_clause: ($) => seq("requires", "{", commaSep1($.module_path), "}"),

    native_declaration: ($) =>
      seq(
        "native",
        choice(
          $.function_declaration,
          seq(
            "type",
            field("name", $.identifier),
            optional($.generic_parameters),
            optional(seq(":", $.trait_bounds)),
            optional($.where_clause),
            ";",
          ),
        ),
      ),

    // --- Components and systems --------------------------------------------

    component_declaration: ($) =>
      seq(
        "component",
        field("name", $.identifier),
        optional($.generic_parameters),
        optional($.implements_clause),
        optional($.where_clause),
        field("body", $.member_list),
      ),
    system_declaration: ($) =>
      seq(
        "system",
        field("name", $.identifier),
        optional($.generic_parameters),
        optional($.implements_clause),
        optional($.where_clause),
        field("body", $.member_list),
      ),
    member_list: ($) => seq("{", repeat(seq(repeat($.attribute), $._member)), "}"),
    _member: ($) =>
      choice(
        $.input_declaration,
        $.state_declaration,
        $.computed_declaration,
        $.event_declaration,
        $.slot_declaration,
        $.const_declaration,
        $.function_declaration,
        $.effect_declaration,
        $.resource_declaration,
        $.native_declaration,
        $.view_declaration,
      ),
    input_declaration: ($) =>
      seq("input", field("name", $.identifier), ":", field("type", $._type), optional(seq("=", field("default", $._expression))), ";"),
    state_declaration: ($) =>
      seq("state", field("name", $.identifier), optional(seq(":", field("type", $._type))), "=", field("value", $._expression), ";"),
    computed_declaration: ($) =>
      seq("computed", field("name", $.identifier), optional(seq(":", field("type", $._type))), "=", field("value", $._expression), ";"),
    event_declaration: ($) =>
      seq("event", field("name", $.identifier), "(", commaSep(seq(field("parameter", $.identifier), ":", $._type)), ")", ";"),
    slot_declaration: ($) =>
      seq("slot", field("name", $.identifier), ":", field("type", $._type), optional(seq("=", choice($.none, "empty"))), ";"),
    effect_declaration: ($) =>
      seq(
        "effect",
        field("name", $.identifier),
        optional(seq("when", "(", commaSep1($._expression), ")")),
        optional(seq("run", $.path)),
        "{",
        repeat($._statement),
        optional(seq("cleanup", $.block)),
        "}",
      ),
    resource_declaration: ($) =>
      seq(
        "resource",
        field("name", $.identifier),
        ":",
        field("type", $._type),
        "{",
        repeat(seq(choice("load", "key", "policy", "scope"), "=", $._expression, ";")),
        "}",
      ),

    // --- Views ------------------------------------------------------------

    view_declaration: ($) => seq("view", field("body", $.view_block)),
    view_block: ($) => seq("{", repeat($._view_item), "}"),
    _view_item: ($) =>
      seq(
        repeat($.attribute),
        choice($.node, $.view_if, $.view_for, $.view_match, $.template_use),
      ),
    node: ($) =>
      seq(
        optional(seq(choice("node", "part"), field("name", $.identifier), ":")),
        field("type", $.type_path),
        field("body", $.node_body),
      ),
    node_body: ($) => seq("{", repeat(seq(repeat($.attribute), $._node_member)), "}"),
    _node_member: ($) =>
      choice(
        $.property,
        $.binding,
        $.event_handler,
        $.fill,
        $.node,
        $.view_if,
        $.view_for,
        $.view_match,
        $.template_use,
        $.part_override,
        $.part_replace,
      ),
    property: ($) => seq(field("name", $.property_path), ":", field("value", $._expression), ";"),
    property_path: ($) => seq($.identifier, repeat(seq(".", $.identifier))),
    binding: ($) =>
      seq("bind", field("name", $.property_path), "<=>", field("value", $._expression), optional(seq("using", $.type_path)), ";"),
    event_handler: ($) =>
      seq(
        "on",
        optional(choice("capture", "bubble")),
        field("event", $.identifier),
        optional(seq("(", $._pattern, ")")),
        field("body", $.block),
      ),
    fill: ($) => seq("fill", field("name", $.identifier), $.view_block),
    view_if: ($) =>
      seq(
        "if",
        field("condition", $._expression),
        optional(seq("preserve", $.string)),
        $.view_block,
        optional(seq("else", choice($.view_if, $.view_block))),
      ),
    view_for: ($) =>
      seq("for", field("pattern", $._pattern), "in", field("items", $._expression), "key", field("key", $._expression), $.view_block),
    view_match: ($) =>
      seq("match", field("value", $._expression), "{", commaSep1($.view_match_arm), "}"),
    view_match_arm: ($) => seq($._pattern, optional(seq("if", $._expression)), "=>", $.view_block),
    part_override: ($) =>
      seq("override", "part", field("name", $.identifier), "{", repeat(choice($.property, $.binding, $.event_handler)), "}"),
    part_replace: ($) => seq("replace", "part", field("name", $.identifier), $.view_block),

    // --- Templates, styles, themes ------------------------------------------

    template_declaration: ($) =>
      seq(
        "template",
        field("name", $.identifier),
        optional($.generic_parameters),
        $.parameters,
        optional($.where_clause),
        "{",
        repeat(choice($.slot_declaration, $.const_declaration, $.function_declaration, $.view_declaration)),
        "}",
      ),
    template_use: ($) =>
      seq(
        "use",
        field("template", $.type_path),
        $.arguments,
        optional(seq("{", repeat(choice($.fill, $.part_override, $.part_replace)), "}")),
        ";",
      ),
    style_declaration: ($) =>
      seq(
        "style",
        field("name", $.identifier),
        "for",
        field("component", $.type_path),
        optional(seq(":", $.type_path, repeat(seq("+", $.type_path)))),
        "{",
        repeat(choice($.property, $.style_when)),
        "}",
      ),
    style_when: ($) => seq("when", field("selector", $._selector), "{", repeat($.property), "}"),
    _selector: ($) =>
      choice(
        $.identifier,
        seq("(", $._selector, ")"),
        prec(3, seq("!", $._selector)),
        prec.left(2, seq($._selector, "&&", $._selector)),
        prec.left(1, seq($._selector, "||", $._selector)),
      ),
    theme_declaration: ($) =>
      seq(
        "theme",
        field("name", $.identifier),
        optional(seq(":", $.type_path)),
        "{",
        repeat($.theme_item),
        "}",
      ),
    theme_item: ($) => seq(field("name", $.identifier), "=", field("value", $._expression), ";"),

    // --- Shaders ---------------------------------------------------------

    shader_declaration: ($) =>
      seq(
        "shader",
        field("name", $.identifier),
        optional($.generic_parameters),
        "{",
        repeat(seq(repeat($.attribute), $._shader_member)),
        "}",
      ),
    _shader_member: ($) => choice($.shader_field, $.function_declaration, $.shader_entry),
    shader_field: ($) =>
      seq(
        field("kind", choice("uniform", "instance", "varying", "texture", "sampler")),
        field("name", $.identifier),
        ":",
        field("type", $._type),
        ";",
      ),
    shader_entry: ($) =>
      seq(
        field("stage", choice("vertex", "fragment", "compute")),
        field("parameters", $.parameters),
        "->",
        field("return_type", $._type),
        field("body", $.block),
      ),

    // --- Blocks and statements ---------------------------------------------

    block: ($) => seq("{", repeat($._statement), optional(field("tail", $._expression)), "}"),

    _statement: ($) =>
      seq(
        repeat($.attribute),
        choice(
          $.let_statement,
          $.assignment_statement,
          $.expression_statement,
          $.return_statement,
          $.break_statement,
          $.continue_statement,
          $.emit_statement,
          $.start_statement,
          $.transaction_statement,
          $.if_statement,
          $.match_statement,
          $.while_statement,
          $.for_statement,
          $.loop_statement,
        ),
      ),
    let_statement: ($) =>
      seq("let", optional("mut"), field("pattern", $._pattern), optional(seq(":", field("type", $._type))), "=", field("value", $._expression), ";"),
    assignment_statement: ($) =>
      seq(
        field("target", $._expression),
        field("operator", choice("=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=")),
        field("value", $._expression),
        ";",
      ),
    expression_statement: ($) => seq($._expression, ";"),
    return_statement: ($) => seq("return", optional($._expression), ";"),
    break_statement: ($) => seq("break", optional($._expression), ";"),
    continue_statement: (_) => seq("continue", ";"),
    emit_statement: ($) => seq("emit", field("event", $.identifier), $.arguments, ";"),
    start_statement: ($) =>
      seq(
        "start",
        field("task", $._expression),
        optional(seq("as", field("name", $.identifier))),
        optional(
          seq(
            "{",
            repeat(
              choice(
                seq("policy", "=", $._expression, ";"),
                seq(choice("success", "error"), "(", $._pattern, ")", $.block),
                seq("cancelled", $.block),
              ),
            ),
            "}",
          ),
        ),
        ";",
      ),
    transaction_statement: ($) => seq("transaction", $.block),
    if_statement: ($) =>
      prec.right(
        seq(
          "if",
          field("condition", $._expression),
          field("consequence", $.block),
          optional(seq("else", field("alternative", choice($.if_statement, $.block)))),
        ),
      ),
    match_statement: ($) => prec.right(seq($._match, optional(";"))),
    while_statement: ($) => seq("while", field("condition", $._expression), field("body", $.block)),
    for_statement: ($) =>
      seq("for", field("pattern", $._pattern), "in", field("items", $._expression), field("body", $.block)),
    loop_statement: ($) => seq("loop", field("body", $.block)),

    // --- Expressions -----------------------------------------------------

    _expression: ($) =>
      choice(
        $._literal,
        $.path,
        $.self,
        $.self_type,
        $.tuple_expression,
        $.list_expression,
        $.record_expression,
        $.parenthesized_expression,
        $.block,
        $.if_expression,
        $.match_expression,
        $.closure_expression,
        $.unary_expression,
        $.binary_expression,
        $.range_expression,
        $.cast_expression,
        $.call_expression,
        $.index_expression,
        $.field_expression,
        $.try_expression,
      ),

    path: ($) => prec(PREC.path, seq($.identifier, repeat(seq("::", $.identifier)))),

    _literal: ($) =>
      choice(
        $.integer,
        $.float,
        $.unit_literal,
        $.string,
        $.raw_string,
        $.char,
        $.color,
        $.boolean,
        $.none,
      ),
    integer: (_) =>
      token(
        seq(
          choice(/0x[0-9A-Fa-f_]+/, /0o[0-7_]+/, /0b[01_]+/, /[0-9][0-9_]*/),
          optional(choice("i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64")),
        ),
      ),
    float: (_) =>
      token(
        seq(
          /[0-9][0-9_]*/,
          choice(seq(".", /[0-9][0-9_]*/, optional(/[eE][+-]?[0-9_]+/)), /[eE][+-]?[0-9_]+/),
          optional(choice("f32", "f64")),
        ),
      ),
    unit_literal: (_) => token(seq(/[0-9][0-9_]*(\.[0-9][0-9_]*)?/, choice(...UNITS, "%"))),
    string: ($) =>
      seq(
        '"',
        repeat(choice($.string_content, $.escape_sequence, $.interpolation)),
        token.immediate('"'),
      ),
    string_content: (_) => token.immediate(prec(1, /[^"\\{]+|\{/)),
    interpolation: (_) => token.immediate(prec(2, /\{[A-Za-z_0-9]*(:[^}"]*)?\}/)),
    escape_sequence: (_) => token.immediate(seq("\\", choice(/[nrt0\\"'{}]/, /u\{[0-9A-Fa-f]{1,6}\}/))),
    raw_string: (_) => token(choice(seq('r"', /[^"]*/, '"'), seq('r#"', /([^"]|"[^#])*/, '"#'))),
    char: (_) => token(seq("'", choice(/[^'\\]/, seq("\\", choice(/[nrt0\\"']/, /u\{[0-9A-Fa-f]{1,6}\}/))), "'")),
    color: (_) => token(seq("#", /[0-9A-Fa-f]{3,8}/)),
    boolean: (_) => choice("true", "false"),
    none: (_) => "None",
    self: (_) => "self",

    tuple_expression: ($) => seq("(", $._expression, ",", commaSep($._expression), ")"),
    list_expression: ($) => seq("[", commaSep($._expression), "]"),
    record_expression: ($) =>
      seq(
        field("type", $.path),
        optional(seq("::", $.generic_arguments)),
        "{",
        commaSep(
          choice(
            seq(field("field", $.identifier), ":", $._expression),
            field("field", $.identifier),
            seq("..", $._expression),
          ),
        ),
        "}",
      ),
    parenthesized_expression: ($) => seq("(", $._expression, ")"),
    if_expression: ($) =>
      prec.right(
        seq(
          "if",
          field("condition", $._expression),
          field("consequence", $.block),
          "else",
          field("alternative", choice($.if_expression, $.block)),
        ),
      ),
    match_expression: ($) => $._match,
    _match: ($) => seq("match", field("value", $._expression), "{", commaSep1($.match_arm), "}"),
    match_arm: ($) =>
      seq(field("pattern", $._pattern), optional(seq("if", $._expression)), "=>", field("value", $._expression)),
    closure_expression: ($) =>
      prec(
        PREC.closure,
        seq(
          optional("move"),
          choice("||", seq("|", commaSep1($.closure_parameter), "|")),
          optional(seq("->", $._type)),
          field("body", $._expression),
        ),
      ),
    closure_parameter: ($) => seq(optional("mut"), $._pattern, optional(seq(":", $._type))),

    unary_expression: ($) =>
      prec(PREC.unary, seq(field("operator", choice("!", "~", "+", "-", "await")), field("operand", $._expression))),
    binary_expression: ($) => {
      const table = [
        [PREC.coalesce, "??", prec.right],
        [PREC.or, "||", prec.left],
        [PREC.and, "&&", prec.left],
        [PREC.compare, choice("==", "!=", "<", "<=", ">", ">="), prec.left],
        [PREC.bitor, "|", prec.left],
        [PREC.bitxor, "^", prec.left],
        [PREC.bitand, "&", prec.left],
        [PREC.shift, choice("<<", ">>"), prec.left],
        [PREC.additive, choice("+", "-"), prec.left],
        [PREC.multiplicative, choice("*", "/", "%"), prec.left],
      ];
      return choice(
        ...table.map(([level, operator, assoc]) =>
          assoc(
            level,
            seq(field("left", $._expression), field("operator", operator), field("right", $._expression)),
          ),
        ),
      );
    },
    range_expression: ($) =>
      prec.left(PREC.range, seq($._expression, choice("..", "..="), $._expression)),
    cast_expression: ($) => prec.left(PREC.cast, seq($._expression, "as", $._type)),
    call_expression: ($) =>
      prec(
        PREC.postfix,
        seq(
          field("function", $._expression),
          optional(seq("::", $.generic_arguments)),
          field("arguments", $.arguments),
        ),
      ),
    arguments: ($) => seq("(", commaSep(choice($.named_argument, $._expression)), ")"),
    named_argument: ($) => seq(field("name", $.identifier), ":", field("value", $._expression)),
    index_expression: ($) => prec(PREC.postfix, seq($._expression, "[", $._expression, "]")),
    field_expression: ($) =>
      prec(PREC.postfix, seq(field("value", $._expression), choice(".", "?."), field("field", $.identifier))),
    try_expression: ($) => prec(PREC.postfix, seq($._expression, "?")),

    // --- Patterns ---------------------------------------------------------

    _pattern: ($) =>
      choice(
        $.wildcard,
        $.identifier_pattern,
        $.tuple_pattern,
        $.list_pattern,
        $.constructor_pattern,
        $.qualified_pattern,
        $.integer,
        $.negative_integer,
        $.string,
        $.char,
        $.boolean,
        $.none,
        $.or_pattern,
        $.range_pattern,
        $.binding_pattern,
        $.parenthesized_pattern,
      ),
    wildcard: (_) => "_",
    negative_integer: ($) => seq("-", $.integer),
    parenthesized_pattern: ($) => seq("(", $._pattern, ")"),
    identifier_pattern: ($) => seq(optional("mut"), $.identifier),
    qualified_pattern: ($) => seq($.identifier, repeat1(seq("::", $.identifier))),
    or_pattern: ($) => prec.left(-2, seq($._pattern, "|", $._pattern)),
    range_pattern: ($) => prec.left(-1, seq($._pattern, choice("..", "..="), $._pattern)),
    binding_pattern: ($) => seq(optional("mut"), $.identifier, "@", $._pattern),
    tuple_pattern: ($) => seq("(", $._pattern, ",", commaSep($._pattern), ")"),
    list_pattern: ($) =>
      seq("[", commaSep(choice($._pattern, seq("..", optional($.identifier)))), "]"),
    constructor_pattern: ($) =>
      seq(
        $.path,
        choice(
          seq("(", commaSep($._pattern), ")"),
          seq(
            "{",
            commaSep(choice(seq($.identifier, ":", $._pattern), $.identifier, "..")),
            "}",
          ),
        ),
      ),

    identifier: (_) => /(r#)?[A-Za-z_][A-Za-z0-9_]*/,
  },
});
