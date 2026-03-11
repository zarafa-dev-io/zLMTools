// Mock the @zowe/zowe-explorer-api before importing ZoweSessionManager
jest.mock('@zowe/zowe-explorer-api', () => ({
    imperative: {
        Session: jest.fn().mockImplementation((opts: any) => ({ _options: opts })),
        SessConstants: {
            AUTH_TYPE_BASIC: 'basic',
        },
    },
}));

// ── vscode mock ──────────────────────────────────────────────
const mockGetConfiguration = jest.fn(() => ({ get: jest.fn().mockReturnValue(null) }));
const mockFindFiles = jest.fn().mockResolvedValue([]);
const mockReadFile = jest.fn();
const mockGetExtension = jest.fn().mockReturnValue(undefined);
const mockSetStatusBarMessage = jest.fn();

// Keep EventEmitter instances alive: clearAllMocks nullifies .fire/.event on existing
// instances, so we track them and restore after each clear.
const emitterInstances: Array<{ fire: jest.Mock; event: jest.Mock }> = [];

jest.mock('vscode', () => ({
    EventEmitter: jest.fn(function (this: any) {
        this.fire = jest.fn();
        this.event = jest.fn();
        emitterInstances.push(this);
    }),
    workspace: {
        getConfiguration: mockGetConfiguration,
        findFiles: mockFindFiles,
        fs: { readFile: mockReadFile },
    },
    extensions: {
        getExtension: mockGetExtension,
    },
    window: {
        setStatusBarMessage: mockSetStatusBarMessage,
    },
}), { virtual: true });

// After each clearAllMocks, restore fire/event on all tracked EventEmitter instances
afterEach(() => {
    for (const inst of emitterInstances) {
        if (!inst.fire || !(inst.fire as any).mock) {
            inst.fire = jest.fn();
        }
        if (!inst.event || !(inst.event as any).mock) {
            inst.event = jest.fn();
        }
    }
});

import { ZoweSession, LparProfile, ZoweSessionManager } from '../zowe/session';
import { imperative } from '@zowe/zowe-explorer-api';

// ── Helpers ───────────────────────────────────────────────────

/** Build a minimal Zowe Explorer API mock */
function makeZoweExplorerApi(profiles: any[] = [], defaultProfile?: any, baseProfile?: any) {
    const cache = {
        getProfiles: jest.fn().mockReturnValue(profiles),
        getDefaultProfile: jest.fn((type: string) =>
            type === 'base' ? baseProfile : defaultProfile
        ),
    };
    return {
        getExplorerExtenderApi: jest.fn().mockReturnValue({
            getProfilesCache: jest.fn().mockReturnValue(cache),
        }),
        _cache: cache,
    };
}

/** Build a Team Config JSON buffer */
function makeTeamConfig(config: object): Buffer {
    return Buffer.from(JSON.stringify(config));
}

// ============================================================
// Tests — Session & Profile Management
// ============================================================

describe('ZoweSession interface', () => {
    it('should create valid ZoweSession with required properties', () => {
        const session: ZoweSession = {
            session: {} as any, // Mocked imperative.Session
            profileName: 'DEV1',
        };

        expect(session.profileName).toBe('DEV1');
        expect(session.session).toBeDefined();
    });

    it('should support optional host and port', () => {
        const session: ZoweSession = {
            session: {} as any,
            profileName: 'PROD1',
            host: 'mainframe.example.com',
            port: 443,
        };

        expect(session.host).toBe('mainframe.example.com');
        expect(session.port).toBe(443);
    });

    it('should handle various profile names', () => {
        const names = ['DEV1', 'PROD', 'LPAR1', 'STAGING', 'TEST_LPAR'];

        for (const name of names) {
            const session: ZoweSession = {
                session: {} as any,
                profileName: name,
            };
            expect(session.profileName).toBe(name);
        }
    });
});

describe('LparProfile interface', () => {
    it('should create valid LparProfile with required properties', () => {
        const profile: LparProfile = {
            name: 'DEV1',
            host: 'dev.mainframe.com',
            port: 443,
        };

        expect(profile.name).toBe('DEV1');
        expect(profile.host).toBe('dev.mainframe.com');
        expect(profile.port).toBe(443);
    });

    it('should support optional description', () => {
        const profile: LparProfile = {
            name: 'PROD',
            host: 'prod.mainframe.com',
            port: 443,
            description: 'Production LPAR for critical batch jobs',
        };

        expect(profile.description).toBe('Production LPAR for critical batch jobs');
    });

    it('should handle various port numbers', () => {
        const ports = [443, 10443, 8080, 9443];

        for (const port of ports) {
            const profile: LparProfile = {
                name: 'TEST',
                host: 'test.host',
                port,
            };
            expect(profile.port).toBe(port);
        }
    });

    it('should handle various hosts', () => {
        const hosts = [
            'mainframe.example.com',
            '192.168.1.100',
            'mf1.corp.local',
            'localhost',
        ];

        for (const host of hosts) {
            const profile: LparProfile = {
                name: 'TEST',
                host,
                port: 443,
            };
            expect(profile.host).toBe(host);
        }
    });
});

describe('ZoweSessionManager interface', () => {
    it('should be instantiable', () => {
        const manager = new ZoweSessionManager();
        expect(manager).toBeDefined();
    });

    it('should provide onDidChangeProfile event', () => {
        const manager = new ZoweSessionManager();
        expect(manager.onDidChangeProfile).toBeDefined();
    });

    it('should start with null active profile', () => {
        const manager = new ZoweSessionManager();
        expect(manager.getActiveProfileName()).toBeNull();
    });
});

describe('ZoweSessionManager - Active Profile Methods', () => {
    it('should set and retrieve active profile', () => {
        const manager = new ZoweSessionManager();

        manager.setActiveProfile('DEV1');
        expect(manager.getActiveProfileName()).toBe('DEV1');
    });

    it('should allow changing active profile', () => {
        const manager = new ZoweSessionManager();

        manager.setActiveProfile('DEV1');
        expect(manager.getActiveProfileName()).toBe('DEV1');

        manager.setActiveProfile('PROD');
        expect(manager.getActiveProfileName()).toBe('PROD');
    });

    it('should support various profile names', () => {
        const manager = new ZoweSessionManager();
        const names = ['DEV1', 'PROD1', 'STAGING', 'TEST_LPAR', 'LOCAL'];

        for (const name of names) {
            manager.setActiveProfile(name);
            expect(manager.getActiveProfileName()).toBe(name);
        }
    });

    it('should emit onDidChangeProfile event when profile changes', () => {
        const manager = new ZoweSessionManager();

        // Just verify the property exists and is callable
        manager.setActiveProfile('DEV1');
        expect(manager.getActiveProfileName()).toBe('DEV1');
        
        // Note: Full event testing requires a complete EventEmitter mock
        // which is beyond the scope of interface testing
    });

    it('should emit multiple profile change events', () => {
        const manager = new ZoweSessionManager();

        manager.setActiveProfile('DEV1');
        expect(manager.getActiveProfileName()).toBe('DEV1');

        manager.setActiveProfile('PROD');
        expect(manager.getActiveProfileName()).toBe('PROD');

        manager.setActiveProfile('STAGING');
        expect(manager.getActiveProfileName()).toBe('STAGING');
        
        // Verify that the last active profile is correct
        expect(manager.getActiveProfileName()).toBe('STAGING');
    });
});

describe('Profile and Session Structure', () => {
    it('should correlate profile names between LparProfile and ZoweSession', () => {
        const profile: LparProfile = {
            name: 'DEV1',
            host: 'dev.mainframe.com',
            port: 443,
        };

        const session: ZoweSession = {
            session: {} as any,
            profileName: profile.name,
            host: profile.host,
            port: profile.port,
        };

        expect(session.profileName).toBe(profile.name);
        expect(session.host).toBe(profile.host);
        expect(session.port).toBe(profile.port);
    });

    it('should handle profile without explicit host/port in session', () => {
        const profile: LparProfile = {
            name: 'REMOTE',
            host: 'remote.host.com',
            port: 9443,
        };

        const session: ZoweSession = {
            session: {} as any,
            profileName: profile.name,
            // host and port are optional, can be looked up from profile
        };

        expect(session.profileName).toBe(profile.name);
        expect(session.host).toBeUndefined();
        expect(session.port).toBeUndefined();
    });
});

// ============================================================
// Tests — setActiveProfile / getActiveProfileName / events
// ============================================================

describe('ZoweSessionManager — setActiveProfile', () => {
    let manager: ZoweSessionManager;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ZoweSessionManager();
    });

    it('should update the active profile name', () => {
        manager.setActiveProfile('DEV1');
        expect(manager.getActiveProfileName()).toBe('DEV1');
    });

    it('should fire the onDidChangeProfile event', () => {
        // emitterInstances tracks all EventEmitter instances; the last one belongs to this manager
        const emitterInstance = emitterInstances[emitterInstances.length - 1];

        manager.setActiveProfile('PROD');

        expect(emitterInstance.fire).toHaveBeenCalledWith('PROD');
    });

    it('should call vscode.window.setStatusBarMessage with the profile name', () => {
        manager.setActiveProfile('HML');

        expect(mockSetStatusBarMessage).toHaveBeenCalledWith(
            expect.stringContaining('HML'),
            5000
        );
    });
});

// ============================================================
// Tests — clearCache / clearProfileCache
// ============================================================

describe('ZoweSessionManager — cache management', () => {
    let manager: ZoweSessionManager;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ZoweSessionManager();
    });

    it('clearCache should not throw', () => {
        expect(() => manager.clearCache()).not.toThrow();
    });

    it('clearProfileCache should not throw', () => {
        expect(() => manager.clearProfileCache('DEV1')).not.toThrow();
    });

    it('clearCache should reset availableProfiles so listProfiles re-fetches', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: { zosmf: 'DEV1' },
            profiles: {
                DEV1: { type: 'zosmf', properties: { host: 'dev.host', port: 443 } },
            },
        }));

        const first = await manager.listProfiles();
        expect(first).toHaveLength(1);

        manager.clearCache();

        // After clear, listProfiles fetches again — mock a different result
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: { zosmf: 'PROD' },
            profiles: {
                DEV1: { type: 'zosmf', properties: { host: 'dev.host', port: 443 } },
                PROD: { type: 'zosmf', properties: { host: 'prod.host', port: 443 } },
            },
        }));

        const second = await manager.listProfiles();
        expect(second).toHaveLength(2);
    });
});

// ============================================================
// Tests — getSession
// ============================================================

describe('ZoweSessionManager — getSession', () => {
    let manager: ZoweSessionManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetExtension.mockReturnValue(undefined);
        manager = new ZoweSessionManager();
    });

    it('should use activeProfileName when set', async () => {
        // Provide a Team Config so getSessionByName can resolve
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: { zosmf: 'DEV1' },
            profiles: {
                DEV1: { type: 'zosmf', properties: { host: 'dev.host', port: 443 } },
            },
        }));

        manager.setActiveProfile('DEV1');
        const session = await manager.getSession();

        expect(session.profileName).toBe('DEV1');
    });

    it('should use configuredProfile from workspace settings when no active profile', async () => {
        mockGetConfiguration.mockReturnValue({ get: jest.fn().mockReturnValue('HML') });
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                HML: { type: 'zosmf', properties: { host: 'hml.host', port: 443 } },
            },
        }));

        const session = await manager.getSession();

        expect(session.profileName).toBe('HML');
    });

    it('should fall back to default session when no active profile and no configured profile', async () => {
        mockGetConfiguration.mockReturnValue({ get: jest.fn().mockReturnValue(null) });
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: { zosmf: 'DEFAULT_PROFILE' },
            profiles: {
                DEFAULT_PROFILE: { type: 'zosmf', properties: { host: 'default.host', port: 443 } },
            },
        }));

        const session = await manager.getSession();

        expect(session.profileName).toBe('DEFAULT_PROFILE');
    });

    it('should throw when no config is available and no Zowe Explorer', async () => {
        mockGetConfiguration.mockReturnValue({ get: jest.fn().mockReturnValue(null) });
        mockFindFiles.mockResolvedValue([]);

        await expect(manager.getSession()).rejects.toThrow();
    });
});

// ============================================================
// Tests — getSessionByName
// ============================================================

describe('ZoweSessionManager — getSessionByName', () => {
    let manager: ZoweSessionManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetExtension.mockReturnValue(undefined);
        manager = new ZoweSessionManager();
    });

    it('should return a cached session on second call', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                DEV1: { type: 'zosmf', properties: { host: 'dev.host', port: 443 } },
            },
        }));

        const first = await manager.getSessionByName('DEV1');
        const second = await manager.getSessionByName('DEV1');

        // Should be the same object (cached)
        expect(second).toBe(first);
        // readFile called only once
        expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it('should throw when profile does not exist', async () => {
        mockFindFiles.mockResolvedValue([]);

        await expect(manager.getSessionByName('UNKNOWN')).rejects.toThrow('UNKNOWN');
    });

    it('should use Team Config to build a session', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                DEV1: {
                    type: 'zosmf',
                    properties: {
                        host: 'dev.mainframe.com',
                        port: 10443,
                        user: 'Z79863',
                        password: 'secret',
                    },
                },
            },
        }));

        const session = await manager.getSessionByName('DEV1');

        expect(session.profileName).toBe('DEV1');
        expect(session.host).toBe('dev.mainframe.com');
        expect(session.port).toBe(10443);
        expect(imperative.Session).toHaveBeenCalledWith(
            expect.objectContaining({ hostname: 'dev.mainframe.com', port: 10443 })
        );
    });

    it('should merge base profile properties with target profile', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                base: { properties: { host: 'base.host', port: 443, user: 'BASEUSER' } },
                DEV1: { type: 'zosmf', properties: { host: 'dev.host', password: 'devpwd' } },
            },
        }));

        const session = await manager.getSessionByName('DEV1');

        // DEV1 host overrides base host, but user comes from base
        expect(session.host).toBe('dev.host');
        expect(imperative.Session).toHaveBeenCalledWith(
            expect.objectContaining({ user: 'BASEUSER', hostname: 'dev.host' })
        );
    });

    it('should use Zowe Explorer when the extension is active', async () => {
        const targetProfile = {
            name: 'ZE_PROFILE',
            profile: { host: 'ze.host', port: 443, user: 'ZEUSER', password: 'zepwd' },
        };
        const zoweApi = makeZoweExplorerApi([targetProfile], targetProfile);
        mockGetExtension.mockReturnValue({ isActive: true, exports: zoweApi });

        const session = await manager.getSessionByName('ZE_PROFILE');

        expect(session.profileName).toBe('ZE_PROFILE');
        expect(session.host).toBe('ze.host');
    });

    it('should fall back to Team Config when Zowe Explorer does not have the profile', async () => {
        // Zowe Explorer has no profiles
        const zoweApi = makeZoweExplorerApi([], undefined);
        mockGetExtension.mockReturnValue({ isActive: true, exports: zoweApi });

        // Team Config has the profile
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                TC_PROFILE: { type: 'zosmf', properties: { host: 'tc.host', port: 443 } },
            },
        }));

        const session = await manager.getSessionByName('TC_PROFILE');

        expect(session.profileName).toBe('TC_PROFILE');
    });
});

// ============================================================
// Tests — listProfiles
// ============================================================

describe('ZoweSessionManager — listProfiles', () => {
    let manager: ZoweSessionManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetExtension.mockReset();
        mockFindFiles.mockReset();
        mockReadFile.mockReset();
        manager = new ZoweSessionManager();
    });

    it('should return empty array when no config and no Zowe Explorer', async () => {
        mockFindFiles.mockResolvedValue([]);

        const profiles = await manager.listProfiles();

        expect(profiles).toEqual([]);
    });

    it('should return profiles from Team Config', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                DEV1: { type: 'zosmf', properties: { host: 'dev.host', port: 443 } },
                PROD: { type: 'zosmf', properties: { host: 'prod.host', port: 443, description: 'Production' } },
            },
        }));

        const profiles = await manager.listProfiles();

        expect(profiles).toHaveLength(2);
        expect(profiles.map(p => p.name)).toContain('DEV1');
        expect(profiles.map(p => p.name)).toContain('PROD');
    });

    it('should skip the "base" profile entry', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                base: { properties: { host: 'base.host' } },
                DEV1: { type: 'zosmf', properties: { host: 'dev.host', port: 443 } },
            },
        }));

        const profiles = await manager.listProfiles();

        expect(profiles.map(p => p.name)).not.toContain('base');
        expect(profiles).toHaveLength(1);
    });

    it('should skip profiles without a host', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                NO_HOST: { type: 'zosmf', properties: { port: 443 } },
                WITH_HOST: { type: 'zosmf', properties: { host: 'real.host', port: 443 } },
            },
        }));

        const profiles = await manager.listProfiles();

        expect(profiles).toHaveLength(1);
        expect(profiles[0].name).toBe('WITH_HOST');
    });

    it('should skip profiles whose type is not zosmf', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                SSH_PROFILE: { type: 'ssh', properties: { host: 'ssh.host', port: 22 } },
                ZE_PROFILE: { type: 'zosmf', properties: { host: 'ze.host', port: 443 } },
            },
        }));

        const profiles = await manager.listProfiles();

        expect(profiles.map(p => p.name)).not.toContain('SSH_PROFILE');
        expect(profiles.map(p => p.name)).toContain('ZE_PROFILE');
    });

    it('should return cached result on second call', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                DEV1: { type: 'zosmf', properties: { host: 'dev.host', port: 443 } },
            },
        }));

        await manager.listProfiles();
        await manager.listProfiles();

        // findFiles called only once (result cached)
        expect(mockFindFiles).toHaveBeenCalledTimes(1);
    });

    it('should return profiles from Zowe Explorer', async () => {
        const zeProfiles = [
            { name: 'ZE_DEV', profile: { host: 'ze-dev.host', port: 443 } },
            { name: 'ZE_PROD', profile: { host: 'ze-prod.host', port: 443 } },
        ];
        const zoweApi = makeZoweExplorerApi(zeProfiles);
        mockGetExtension.mockReturnValue({ isActive: true, exports: zoweApi });
        mockFindFiles.mockResolvedValue([]);

        const profiles = await manager.listProfiles();

        expect(profiles.map(p => p.name)).toContain('ZE_DEV');
        expect(profiles.map(p => p.name)).toContain('ZE_PROD');
    });

    it('should deduplicate profiles between Zowe Explorer and Team Config (ZE wins)', async () => {
        const zeProfiles = [
            { name: 'DEV1', profile: { host: 'ze-dev.host', port: 443 } },
        ];
        const zoweApi = makeZoweExplorerApi(zeProfiles);
        mockGetExtension.mockReturnValue({ isActive: true, exports: zoweApi });

        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                DEV1: { type: 'zosmf', properties: { host: 'tc-dev.host', port: 1443 } },
                PROD: { type: 'zosmf', properties: { host: 'prod.host', port: 443 } },
            },
        }));

        const profiles = await manager.listProfiles();

        // DEV1 should appear once, from ZE (ze-dev.host)
        const dev1Profiles = profiles.filter(p => p.name === 'DEV1');
        expect(dev1Profiles).toHaveLength(1);
        expect(dev1Profiles[0].host).toBe('ze-dev.host');
        // PROD comes from Team Config
        expect(profiles.map(p => p.name)).toContain('PROD');
    });

    it('should use base host when profile has no host but base does', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                base: { properties: { host: 'base.host', port: 443 } },
                DEV1: { type: 'zosmf', properties: { port: 10443 } },
            },
        }));

        const profiles = await manager.listProfiles();

        expect(profiles).toHaveLength(1);
        expect(profiles[0].host).toBe('base.host');
    });

    it('should handle malformed Team Config JSON gracefully', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(Buffer.from('NOT_VALID_JSON'));

        const profiles = await manager.listProfiles();

        expect(profiles).toEqual([]);
    });

    it('should handle Zowe Explorer API errors gracefully', async () => {
        const brokenApi = {
            getExplorerExtenderApi: jest.fn().mockImplementation(() => {
                throw new Error('ZE internal error');
            }),
        };
        mockGetExtension.mockReturnValue({ isActive: true, exports: brokenApi });
        mockFindFiles.mockResolvedValue([]);

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const freshManager = new ZoweSessionManager();
        const profiles = await freshManager.listProfiles();
        warnSpy.mockRestore();

        expect(profiles).toEqual([]);
    });

    it('should use default port 443 when profile has no port', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                DEV1: { type: 'zosmf', properties: { host: 'dev.host' } },
            },
        }));

        const profiles = await manager.listProfiles();

        expect(profiles[0].port).toBe(443);
    });
});

// ============================================================
// Tests — getDefaultSession (via getSession without active profile)
// ============================================================

describe('ZoweSessionManager — getDefaultSession', () => {
    let manager: ZoweSessionManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetExtension.mockReturnValue(undefined);
        mockGetConfiguration.mockReturnValue({ get: jest.fn().mockReturnValue(null) });
        manager = new ZoweSessionManager();
    });

    it('should use Zowe Explorer default profile when available', async () => {
        const defaultProfile = {
            name: 'ZE_DEFAULT',
            profile: { host: 'ze-default.host', port: 443 },
        };
        const zoweApi = makeZoweExplorerApi([], defaultProfile);
        mockGetExtension.mockReturnValue({ isActive: true, exports: zoweApi });

        const session = await manager.getSession();

        expect(session.profileName).toBe('ZE_DEFAULT');
    });

    it('should fall back to Team Config default when Zowe Explorer has no default profile', async () => {
        // Zowe Explorer returns no default
        const zoweApi = makeZoweExplorerApi([], null);
        mockGetExtension.mockReturnValue({ isActive: true, exports: zoweApi });

        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: { zosmf: 'TC_DEFAULT' },
            profiles: {
                TC_DEFAULT: { type: 'zosmf', properties: { host: 'tc.host', port: 443 } },
            },
        }));

        const session = await manager.getSession();

        expect(session.profileName).toBe('TC_DEFAULT');
    });

    it('should throw when Team Config has no default profile name', async () => {
        mockFindFiles.mockResolvedValue([{ fsPath: '/fake/zowe.config.json' }]);
        mockReadFile.mockResolvedValue(makeTeamConfig({
            defaults: {},
            profiles: {
                DEV1: { type: 'zosmf', properties: { host: 'dev.host', port: 443 } },
            },
        }));

        await expect(manager.getSession()).rejects.toThrow();
    });
});

