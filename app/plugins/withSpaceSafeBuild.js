// This project lives in a folder whose name contains a space ("Claude Projects"). Two of the
// iOS build scripts Expo generates pass a path to the shell without quoting it, so the build
// stops with "No such file or directory: /Users/.../Claude". Both are fixed here, at project
// generation time, so the fixes survive `expo prebuild --clean` and a fresh `npm install`.
const { withXcodeProject, withPodfile } = require('expo/config-plugins');

const UNQUOTED_BUNDLE_CALL =
  "`\\\"$NODE_BINARY\\\" --print \\\"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\\\"`";

const PODFILE_MARKER = '# [jarvi] quote script paths that contain a space';
const PODFILE_FIX = `
    ${PODFILE_MARKER}
    installer.pods_project.targets.each do |target|
      next unless target.name == 'EXConstants'
      target.shell_script_build_phases.each do |phase|
        script = '$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh'
        next if phase.shell_script.include?('\\\\"' + script)
        phase.shell_script = phase.shell_script.gsub(script, '\\\\"' + script + '\\\\"')
      end
    end
`;

function withQuotedBundlePhase(config) {
  return withXcodeProject(config, (cfg) => {
    const phases = cfg.modResults.hash.project.objects.PBXShellScriptBuildPhase || {};
    for (const phase of Object.values(phases)) {
      if (typeof phase !== 'object' || typeof phase.shellScript !== 'string') continue;
      if (!phase.shellScript.includes(UNQUOTED_BUNDLE_CALL)) continue;
      if (phase.shellScript.includes('\\"' + UNQUOTED_BUNDLE_CALL)) continue;
      phase.shellScript = phase.shellScript.replace(UNQUOTED_BUNDLE_CALL, '\\"' + UNQUOTED_BUNDLE_CALL + '\\"');
    }
    return cfg;
  });
}

function withQuotedConstantsPhase(config) {
  return withPodfile(config, (cfg) => {
    if (cfg.modResults.contents.includes(PODFILE_MARKER)) return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /post_install do \|installer\|\n/,
      (match) => match + PODFILE_FIX
    );
    return cfg;
  });
}

module.exports = (config) => withQuotedConstantsPhase(withQuotedBundlePhase(config));
