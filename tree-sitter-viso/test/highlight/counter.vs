import viso::math::Vec2F32
// <- keyword
//     ^ namespace

/// Counts.
// <- comment.doc
component Counter {
// <- keyword
//        ^ type
    input step: I32 = 1
//  ^ keyword
//        ^ property
//              ^ type
//                    ^ number
    state count = 0
//  ^ keyword
//        ^ property
    event changed(to: I32)
//        ^ function

    action bump() {
//  ^ keyword
//         ^ function
        count += step
//            ^ operator
        emit changed(count)
//      ^ keyword
//           ^ function
    }

    view {
//  ^ keyword
        Column {
//      ^ tag
            padding: 16dp; background: #1e88e5
//          ^ property
//                   ^ number
//                         ^ property
//                                     ^ constant
            Text("{count} clicks, {{n}}") { font_size: 13sp }
//          ^ tag
//                ^ string.special
//                 ^ variable
//                      ^ string.special
//                        ^ string
//                                ^ string.escape
            Button("Add") { on click { bump() } }
//                 ^ string
//                          ^ keyword
//                                     ^ function
            if count > 3 {
//          ^ keyword
                Text("many")
            }
            slot
//          ^ keyword
            slot footer { Text("end") }
//          ^ keyword
//               ^ label
        }
    }
}

component Page {
    view {
        Card {
            footer { Text("Title") }
//          ^ label
        }
    }
}

shader Ripple {
// <- keyword
//     ^ type
    uniform time: F32
//  ^ keyword
    fragment(frag_coord: Vec4F32) -> ColorLinear {
//  ^ keyword
//           ^ variable.parameter
        return ColorLinear(time, 0.0, 0.0, 1.0)
//      ^ keyword
    }
}
