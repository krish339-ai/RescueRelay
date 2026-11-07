/** Local HTTP is opt-in. Never enable this flag in a release/store build. */
const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins');
module.exports = function withLocalDevelopment(config) {
  const allowHttp = process.env.RESCUERELAY_ALLOW_HTTP_DEV === 'true';
  config = withAndroidManifest(config, result => {
    const application = result.modResults.manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = allowHttp ? 'true' : 'false';
    return result;
  });
  return withInfoPlist(config, result => {
    result.modResults.NSLocalNetworkUsageDescription = 'Connect to your RescueRelay development API on your trusted local network.';
    result.modResults.NSAppTransportSecurity = allowHttp
      ? { NSAllowsArbitraryLoads: true }
      : { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true };
    return result;
  });
};
