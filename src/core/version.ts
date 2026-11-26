import { version } from '../../package.json';

/**
 * The version of this build, read straight from `package.json` — the one place it is ever bumped.
 *
 * Shown in the main menu, and compared with the release notes a device has already read
 * (`Settings.changelogSeen`): a mismatch is what makes the changelog open by itself. The newest
 * entry of that changelog must name this version, which `tests/changelog.test.ts` enforces — so
 * a release is: bump `package.json`, then describe the new version in all four dictionaries.
 */
export const APP_VERSION: string = version;
