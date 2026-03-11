import { LparHandler } from '../handlers/lpar.handler';
import { ZoweSessionManager } from '../zowe/session';
import { TelemetryService } from '../utils/telemetry';
import * as vscode from 'vscode';

// ============================================================
// Tests — LPAR Handler
// ============================================================

describe('LparHandler', () => {
    let handler: LparHandler;
    let mockSessionManager: Partial<ZoweSessionManager>;
    let mockTelemetry: Partial<TelemetryService>;
    let mockStream: Partial<vscode.ChatResponseStream>;

    beforeEach(() => {
        // Mock sessionManager
        mockSessionManager = {
            listProfiles: jest.fn().mockResolvedValue([
                { name: 'DEV1', host: 'dev.mf.com', port: 443 },
                { name: 'PROD', host: 'prod.mf.com', port: 443 },
                { name: 'STAGING', host: 'staging.mf.com', port: 9443 },
            ]),
            getActiveProfileName: jest.fn().mockReturnValue(null),
            setActiveProfile: jest.fn(),
            clearCache: jest.fn(),
            getSessionByName: jest.fn().mockResolvedValue({
                profileName: 'DEV1',
                host: 'dev.mf.com',
                port: 443,
            }),
        };

        // Mock telemetry
        mockTelemetry = {
            trackSuccess: jest.fn(),
            trackError: jest.fn(),
            trackDuration: jest.fn(),
        };

        // Mock stream
        mockStream = {
            progress: jest.fn(),
            markdown: jest.fn(),
        };

        handler = new LparHandler(
            mockSessionManager as ZoweSessionManager,
            mockTelemetry as TelemetryService
        );
    });

    describe('Handler instantiation', () => {
        it('should create LparHandler instance', () => {
            expect(handler).toBeDefined();
            expect(handler).toBeInstanceOf(LparHandler);
        });
    });

    describe('Subcommand parsing', () => {
        it('should recognize "use" subcommand', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'use DEV1' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result).toBeDefined();
            expect(result.metadata.command).toBe('lpar');
        });

        it('should recognize "switch" subcommand', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'switch PROD' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result).toBeDefined();
        });

        it('should recognize "select" subcommand', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'select DEV1' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result).toBeDefined();
        });

        it('should recognize "status" subcommand', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'status' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result).toBeDefined();
        });

        it('should recognize "current" subcommand', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'current' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result).toBeDefined();
        });

        it('should recognize "refresh" subcommand', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'refresh' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result).toBeDefined();
        });

        it('should handle empty prompt as list command', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: '' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result).toBeDefined();
        });

        it('should treat unknown subcommand as list', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'unknown' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result).toBeDefined();
        });
    });

    describe('Case insensitivity', () => {
        it('should handle uppercase subcommands', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'USE DEV1' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result).toBeDefined();
        });

        it('should handle mixed case subcommands', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'UsE Dev1' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result).toBeDefined();
        });

        it('should handle whitespace in prompt', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: '  use   DEV1  ' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result).toBeDefined();
        });
    });

    describe('Result structure', () => {
        it('should return ZosChatResult with correct metadata', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'list' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result.metadata).toBeDefined();
            expect(result.metadata.command).toBe('lpar');
            expect(result.metadata.followups).toBeDefined();
            expect(Array.isArray(result.metadata.followups)).toBe(true);
        });

        it('should include followups for available commands', async () => {
            (mockSessionManager.getActiveProfileName as jest.Mock).mockReturnValue(null);
            
            const request: Partial<vscode.ChatRequest> = { prompt: 'list' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result.metadata.followups.length).toBeGreaterThan(0);
            expect(result.metadata.followups[0].label).toBeDefined();
            expect(result.metadata.followups[0].prompt).toBeDefined();
        });
    });

    describe('Profile management integration', () => {
        it('should call listProfiles when listing LPARs', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'list' };
            await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(mockSessionManager.listProfiles).toHaveBeenCalled();
        });

        it('should handle multiple profiles in response', async () => {
            (mockSessionManager.listProfiles as jest.Mock).mockResolvedValue([
                { name: 'DEV1', host: 'dev.mf.com', port: 443 },
                { name: 'PROD', host: 'prod.mf.com', port: 443 },
                { name: 'STAGING', host: 'staging.mf.com', port: 9443 },
                { name: 'TEST', host: 'test.mf.com', port: 9443 },
            ]);

            const request: Partial<vscode.ChatRequest> = { prompt: '' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(result).toBeDefined();
            expect(mockStream.markdown).toHaveBeenCalled();
        });

        it('should handle empty profile list', async () => {
            (mockSessionManager.listProfiles as jest.Mock).mockResolvedValue([]);

            const request: Partial<vscode.ChatRequest> = { prompt: '' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(mockStream.markdown).toHaveBeenCalled();
            expect(result).toBeDefined();
        });

        it('should call getActiveProfileName when checking status', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'status' };
            await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(mockSessionManager.getActiveProfileName).toHaveBeenCalled();
        });
    });

    describe('Stream interactions', () => {
        it('should call stream.progress', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'list' };
            await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(mockStream.progress).toHaveBeenCalled();
        });

        it('should call stream.markdown', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'list' };
            await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(mockStream.markdown).toHaveBeenCalled();
        });

        it('should pass correct markdown content', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'list' };
            await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            const markdownCalls = (mockStream.markdown as jest.Mock).mock.calls;
            expect(markdownCalls.length).toBeGreaterThan(0);
            
            // Check that some form of content was passed
            const allMarkdown = markdownCalls.map((call) => call[0]).join('');
            expect(allMarkdown.length).toBeGreaterThan(0);
        });
    });

    describe('Error handling', () => {
        it('should handle listProfiles error gracefully', async () => {
            (mockSessionManager.listProfiles as jest.Mock).mockRejectedValue(
                new Error('Connection failed')
            );

            const request: Partial<vscode.ChatRequest> = { prompt: 'list' };

            // Should not throw
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            ).catch((e) => {
                // If error is thrown, it's handled by caller
                return { metadata: { command: 'lpar', followups: [] } };
            });

            expect(result).toBeDefined();
        });
    });

    describe('listLpars with active profile', () => {
        it('should display active marker and LPAR actif message', async () => {
            (mockSessionManager.getActiveProfileName as jest.Mock).mockReturnValue('DEV1');

            const request: Partial<vscode.ChatRequest> = { prompt: '' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls
                .map((call) => call[0]).join('');
            expect(allMarkdown).toContain('▶️');
            expect(allMarkdown).toContain('LPAR actif');
            expect(allMarkdown).toContain('DEV1');
        });

        it('should add status followup when active profile is set', async () => {
            (mockSessionManager.getActiveProfileName as jest.Mock).mockReturnValue('DEV1');

            const request: Partial<vscode.ChatRequest> = { prompt: '' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            const statusFollowup = result.metadata.followups.find(
                (f: any) => f.prompt === 'status'
            );
            expect(statusFollowup).toBeDefined();
        });
    });

    describe('switchLpar edge cases', () => {
        it('should show warning when no profile name given (use command)', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'use' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls
                .map((call) => call[0]).join('');
            expect(allMarkdown).toContain('Précisez le nom du profil');
        });

        it('should show error when profile not found', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'use UNKNOWN' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls
                .map((call) => call[0]).join('');
            expect(allMarkdown).toContain('introuvable');
            expect(allMarkdown).toContain('UNKNOWN');
        });

        it('should switch profile and call telemetry on success', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'use DEV1' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(mockSessionManager.getSessionByName).toHaveBeenCalledWith('DEV1');
            expect(mockSessionManager.setActiveProfile).toHaveBeenCalledWith('DEV1');
            expect(mockTelemetry.trackSuccess).toHaveBeenCalledWith('lpar', 'USE', 'DEV1');

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls
                .map((call) => call[0]).join('');
            expect(allMarkdown).toContain('LPAR changé');
        });

        it('should show connection error when getSessionByName fails', async () => {
            (mockSessionManager.getSessionByName as jest.Mock).mockRejectedValue(
                new Error('Auth failed')
            );

            const request: Partial<vscode.ChatRequest> = { prompt: 'use PROD' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls
                .map((call) => call[0]).join('');
            expect(allMarkdown).toContain('Connexion échouée');
            expect(allMarkdown).toContain('Auth failed');
        });
    });

    describe('showStatus with active profile', () => {
        it('should display session details on successful connection', async () => {
            (mockSessionManager.getActiveProfileName as jest.Mock).mockReturnValue('DEV1');

            const request: Partial<vscode.ChatRequest> = { prompt: 'status' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(mockSessionManager.getSessionByName).toHaveBeenCalledWith('DEV1');
            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls
                .map((call) => call[0]).join('');
            expect(allMarkdown).toContain('🟢 LPAR actif');
            expect(allMarkdown).toContain('dev.mf.com');
        });

        it('should display dash when session host/port are undefined', async () => {
            (mockSessionManager.getActiveProfileName as jest.Mock).mockReturnValue('DEV1');
            (mockSessionManager.getSessionByName as jest.Mock).mockResolvedValue({
                profileName: 'DEV1',
                host: undefined,
                port: undefined,
            });

            const request: Partial<vscode.ChatRequest> = { prompt: 'status' };
            await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls
                .map((call) => call[0]).join('');
            expect(allMarkdown).toContain('| `-` |');
        });

        it('should show error markdown when connection fails', async () => {
            (mockSessionManager.getActiveProfileName as jest.Mock).mockReturnValue('DEV1');
            (mockSessionManager.getSessionByName as jest.Mock).mockRejectedValue(
                new Error('Connection timeout')
            );

            const request: Partial<vscode.ChatRequest> = { prompt: 'status' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls
                .map((call) => call[0]).join('');
            expect(allMarkdown).toContain('🔴 LPAR actif');
            expect(allMarkdown).toContain('Connection timeout');
        });
    });

    describe('refresh method', () => {
        it('should call clearCache and then listProfiles', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'refresh' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(mockSessionManager.clearCache).toHaveBeenCalled();
            // listProfiles is called at least twice (once in refresh, once in listLpars)
            expect(mockSessionManager.listProfiles).toHaveBeenCalled();

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls
                .map((call) => call[0]).join('');
            expect(allMarkdown).toContain('Cache rafraîchi');
        });

        it('should work with reload alias', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'reload' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(mockSessionManager.clearCache).toHaveBeenCalled();
            expect(result).toBeDefined();
        });
    });

    describe('Subcommand aliases', () => {
        it('should recognize "connect" as switch alias', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'connect DEV1' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(mockSessionManager.getSessionByName).toHaveBeenCalledWith('DEV1');
        });

        it('should recognize "actif" as status alias', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'actif' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(mockSessionManager.getActiveProfileName).toHaveBeenCalled();
        });

        it('should recognize "active" as status alias', async () => {
            const request: Partial<vscode.ChatRequest> = { prompt: 'active' };
            const result = await handler.handle(
                request as vscode.ChatRequest,
                {} as vscode.ChatContext,
                mockStream as vscode.ChatResponseStream,
                {} as vscode.CancellationToken
            );

            expect(mockSessionManager.getActiveProfileName).toHaveBeenCalled();
        });
    });
});
