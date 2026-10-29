; Viso highlights. The capture names are the ones both Zed and the
; tree-sitter CLI read.

(line_comment) @comment
(block_comment) @comment
(doc_comment) @comment.doc

(string) @string
(raw_string) @string
(char) @string
(escape_sequence) @string.escape
(interpolation) @string.special
(integer) @number
(float) @number
(negative_integer) @number
(unit_literal) @number
(color) @constant
(boolean) @boolean
(none) @constant
(self) @variable.special
(self_type) @type
(wildcard) @variable.special

(attribute "@" @attribute name: (identifier) @attribute)

(type_identifier) @type
(generic_parameters (identifier) @type)

(component_declaration name: (identifier) @type)
(system_declaration name: (identifier) @type)
(record_declaration name: (identifier) @type)
(enum_declaration name: (identifier) @type)
(trait_declaration name: (identifier) @type)
(type_alias name: (identifier) @type)
(associated_type name: (identifier) @type)
(shader_declaration name: (identifier) @type)
(style_declaration name: (identifier) @type)
(theme_declaration name: (identifier) @type)
(template_declaration name: (identifier) @type)
(native_declaration name: (identifier) @type)
(enum_variant name: (identifier) @variant)

(node type: (type_path (type_identifier) @tag))
(node name: (identifier) @label)

(function_declaration name: (identifier) @function)
(call_expression function: (path (identifier) @function .))
(call_expression function: (field_expression field: (identifier) @function))
(emit_statement event: (identifier) @function)
(event_declaration name: (identifier) @function)
(event_handler event: (identifier) @function)

(input_declaration name: (identifier) @property)
(state_declaration name: (identifier) @property)
(computed_declaration name: (identifier) @property)
(slot_declaration name: (identifier) @property)
(record_field name: (identifier) @property)
(property name: (property_path (identifier) @property))
(binding name: (property_path (identifier) @property))
(theme_item name: (identifier) @property)
(field_expression field: (identifier) @property)
(record_expression field: (identifier) @property)
(named_argument name: (identifier) @property)
(shader_field name: (identifier) @property)

(const_declaration name: (identifier) @constant)
(parameter name: (identifier) @variable.parameter)
(import_declaration (identifier) @namespace)
(path (identifier) @namespace . "::")

[
  "import" "export" "as" "component" "system" "record" "enum" "trait" "impl" "type"
  "implements" "where" "const" "fn" "action" "task" "native" "shader" "let" "mut" "dyn"
  "input" "state" "computed" "event" "slot" "effect" "resource" "view" "style" "theme"
  "template" "part" "node" "fill" "bind" "using" "use" "override" "replace" "preserve"
  "requires" "on" "capture" "bubble" "emit" "start" "transaction" "move" "when" "run"
  "cleanup" "load" "key" "policy" "scope" "success" "error" "cancelled" "empty"
  "uniform" "instance" "varying" "texture" "sampler" "vertex" "fragment" "compute"
] @keyword

[
  "if" "else" "match" "while" "loop" "for" "in" "return" "break" "continue" "await"
] @keyword

[
  "=" "+=" "-=" "*=" "/=" "%=" "&=" "|=" "^=" "<<=" ">>="
  "+" "-" "*" "/" "%" "!" "~" "&" "|" "^" "<<" ">>" "==" "!=" "<" "<=" ">" ">="
  "&&" "||" "??" "?." "?" ".." "..=" "->" "=>" "<=>"
] @operator

["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["," ";" ":" "::" "."] @punctuation.delimiter
