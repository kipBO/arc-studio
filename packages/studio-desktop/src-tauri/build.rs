fn main() {
    println!("cargo:rerun-if-env-changed=ARC_RELEASE_CHANNEL");
    println!("cargo:rerun-if-env-changed=ARC_DESKTOP_TARGET");
    tauri_build::build()
}
