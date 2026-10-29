import viso::math::Vec2F32;
// <- keyword
//     ^ namespace

/// Counts.
// <- comment.doc
component Counter {
// <- keyword
//        ^ type
    input step: I32 = 1;
//  ^ keyword
//        ^ property
//              ^ type
//                    ^ number
    state count = 0;
//  ^ keyword
//        ^ property
    event changed(to: I32);
//        ^ function

    action bump() {
//  ^ keyword
//         ^ function
        count += step;
//            ^ operator
        emit changed(to: count);
//      ^ keyword
//           ^ function
//                   ^ property
    }

    view {
//  ^ keyword
        Column {
//      ^ tag
            padding: 16dp;
//          ^ property
//                   ^ number
            background: #1e88e5;
//                      ^ constant
            Text { text: format("{n} clicks", n: count); }
//          ^ tag
//                       ^ function
//                               ^ string.special
            Button { text: "Add"; on click { bump(); } }
//                         ^ string
//                                ^ keyword
//                                   ^ function
            if count > 3 {
//          ^ keyword
                Text { text: "many"; }
            }
        }
    }
}

shader Ripple {
// <- keyword
//     ^ type
    uniform time: F32;
//  ^ keyword
    vertex(vertex_id: U32) -> VertexOutput {
//  ^ keyword
//         ^ variable.parameter
        return VertexOutput { clip_position: to_clip(time) };
//      ^ keyword
//                            ^ property
    }
}
