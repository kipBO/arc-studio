use std::env;

fn main() {
    println!("cargo:rerun-if-env-changed=ARC_RELEASE_CHANNEL");
    println!("cargo:rerun-if-env-changed=ARC_DESKTOP_TARGET");
    println!("cargo:rerun-if-env-changed=ARC_UPDATE_REPOSITORY");
    let repository = env::var("ARC_UPDATE_REPOSITORY")
        .unwrap_or_else(|_| "relentiousdragon/arc-studio".to_string());
    let mut parts = repository.split('/');
    let owner = parts.next().unwrap_or_default();
    let name = parts.next().unwrap_or_default();
    let valid_part = |part: &str| {
        !part.is_empty()
            && part
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte))
    };
    if !valid_part(owner) || !valid_part(name) || parts.next().is_some() {
        panic!("Invalid ARC_UPDATE_REPOSITORY: {repository}");
    }
    println!("cargo:rustc-env=ARC_UPDATE_REPOSITORY={repository}");
    tauri_build::build()
}
