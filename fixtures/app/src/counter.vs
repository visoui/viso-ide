//! A counter, the fixture every editor shell opens.

/// Counts the clicks on its button.
component Counter {
    input step: I32 = 1;
    state count = 0;
    computed label = format("{n} clicks", n: count);

    action bump() {
        count += step;
    }

    view {
        Column {
            padding: 16dp;
            gap: 8dp;
            background: #1e88e5;
            Text { text: label; }
            Button { text: "Add"; on click { bump(); } }
        }
    }
}
