// @vitest-environment node
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  normalizeProfile,
  toPublicProfile,
  remotePathForProject,
  isGatewayMode,
  distPathFor,
  firstServerId,
  remotePathFor,
  shouldKeepStoredPassword,
  assertGatewayReady,
  PASSWORD_MASK,
} = require('./group-publish-logic');

describe('group publish profile', () => {
  it('defaults unknown mode to direct SFTP and drops empty devices', () => {
    const profile = normalizeProfile({
      groupName: '  业务组  ',
      publishMode: 'mystery',
      gatewayUrl: ' https://gw.example/login ',
      devicesJson: JSON.stringify([
        { projectName: 'portal', remotePath: ' /www/portal/ ' },
        { projectName: '', remotePath: '/www/other/' },
      ]),
    });

    expect(profile).toMatchObject({
      groupName: '业务组',
      publishMode: 'direct-sftp',
      gatewayUrl: 'https://gw.example/login',
      devices: [{ projectName: 'portal', remotePath: '/www/portal/' }],
    });
    expect(isGatewayMode(profile)).toBe(false);
  });

  it('masks password only when one is stored', () => {
    expect(toPublicProfile({ groupName: 'g', publishMode: 'gateway-filezilla' }, true).passwordMasked)
      .toBe(PASSWORD_MASK);
    expect(toPublicProfile({ groupName: 'g' }, false).passwordMasked).toBe('');
  });

  it('finds remote path by project name', () => {
    const profile = normalizeProfile({
      publishMode: 'gateway-filezilla',
      devices: [
        { projectName: 'a', remotePath: '/www/a/' },
        { projectName: 'b', remotePath: '/www/b/' },
      ],
    });
    expect(remotePathForProject(profile, 'b')).toBe('/www/b/');
    expect(remotePathForProject(profile, 'missing')).toBe('');
  });

  it('joins dist path with project distDir', () => {
    expect(distPathFor({ path: '/apps/portal/', distDir: 'build' }))
      .toBe(path.join('/apps/portal/', 'build'));
    expect(distPathFor({ path: '/apps/portal' })).toBe(path.join('/apps/portal', 'dist'));
  });

  it('prefers group config, then project remote path, then server deploy paths', () => {
    expect(remotePathFor(
      { name: 'portal', remotePath: '/www/old/' },
      { defaultRemotePath: '/fallback/' },
      { devices: [{ projectName: 'portal', remotePath: ' /www/portal/ ' }] },
    )).toBe('/www/portal/');
    expect(remotePathFor({ remotePath: '/www/portal/' }, { defaultRemotePath: '/fallback/' }))
      .toBe('/www/portal/');
    expect(remotePathFor({ remotePath: '  ' }, {
      defaultRemotePath: '/fallback/',
      deployPaths: [' /docker/nginx/www/ ', '/backup/'],
    })).toBe('/docker/nginx/www/');
    expect(remotePathFor({}, {
      defaultRemotePath: '/docker/nginx/www/',
      deployPaths: '["/www/a/","/www/b/"]',
    })).toBe('/www/a/');
    expect(remotePathFor({ remotePath: '  ' }, { defaultRemotePath: '/docker/nginx/www/' }))
      .toBe('/docker/nginx/www/');
    expect(firstServerId({ defaultServerIds: [' srv-2 '], defaultServerId: 'srv-1' })).toBe('srv-2');
    expect(firstServerId({ defaultServerId: 'srv-1' })).toBe('srv-1');
  });

  it('keeps stored password when the client sends blank or mask', () => {
    expect(shouldKeepStoredPassword('')).toBe(true);
    expect(shouldKeepStoredPassword(PASSWORD_MASK)).toBe(true);
    expect(shouldKeepStoredPassword(' new-secret ')).toBe(false);
  });

  it('blocks gateway connect until URL, username and remote path are present', () => {
    expect(assertGatewayReady({ publishMode: 'direct-sftp' }, 'portal'))
      .toBe('该分组仍是直连 SFTP，未启用网关交接');
    expect(assertGatewayReady({
      publishMode: 'gateway-filezilla',
      gatewayUrl: 'ftp://x',
      gatewayUsername: 'u',
      devices: [{ projectName: 'portal', remotePath: '/www/portal/' }],
    }, 'portal')).toBe('网关地址必须是 http 或 https 链接');
    expect(assertGatewayReady({
      publishMode: 'gateway-filezilla',
      gatewayUrl: 'https://gw.example/login',
      gatewayUsername: 'ops',
      devices: [{ projectName: 'other', remotePath: '/www/other/' }],
    }, 'portal')).toBe('请先为项目「portal」填写远程路径');
    expect(assertGatewayReady({
      publishMode: 'gateway-filezilla',
      gatewayUrl: 'https://gw.example/login',
      gatewayUsername: 'ops',
      devices: [{ projectName: 'portal', remotePath: '/www/portal/' }],
    }, 'portal')).toBe('');
  });
});
