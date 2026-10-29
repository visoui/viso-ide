fn main() {
    let counter = viso::view!("counter.vs");
    let inline = viso::component! {
        Badge {
            state on = false;
            view { Text { text: if on { "on" } else { "off" }; } }
        }
    };
    viso::run(counter, inline);
}
