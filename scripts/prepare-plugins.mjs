import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const pluginRoot = resolve(
  import.meta.dirname,
  "..",
  "node_modules",
  "@capacitor-community",
  "speech-recognition"
);
const swiftPath = resolve(pluginRoot, "ios", "Plugin", "Plugin.swift");

try {
  await access(swiftPath);
} catch {
  console.log("Speech recognition plugin is not installed; skipping iOS preparation.");
  process.exit(0);
}

let swift = await readFile(swiftPath, "utf8");
const originalDeclaration = "public class SpeechRecognition: CAPPlugin {";

if (swift.includes(originalDeclaration)) {
  swift = swift.replace(
    originalDeclaration,
    `public class SpeechRecognition: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechRecognitionPlugin"
    public let jsName = "SpeechRecognition"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSupportedLanguages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise)
    ]`
  );
  await writeFile(swiftPath, swift);
}

const packageSwift = `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapacitorCommunitySpeechRecognition",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapacitorCommunitySpeechRecognition",
            targets: ["CapacitorCommunitySpeechRecognition"])
    ],
    dependencies: [
        .package(
            url: "https://github.com/ionic-team/capacitor-swift-pm.git",
            from: "8.0.0")
    ],
    targets: [
        .target(
            name: "CapacitorCommunitySpeechRecognition",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Plugin",
            exclude: ["Info.plist", "Plugin.h", "Plugin.m"])
    ]
)
`;

await writeFile(resolve(pluginRoot, "Package.swift"), packageSwift);
console.log("Prepared speech recognition for iOS Swift Package Manager.");
