import { TsoHandler, UssHandler } from '../handlers/stubs';
import { ZoweSessionManager } from '../zowe/session';
import { TelemetryService } from '../utils/telemetry';
import * as vscode from 'vscode';

// ============================================================
// Tests — TsoHandler & UssHandler (stubs)
// ============================================================

describe('TsoHandler', () => {
    let handler: TsoHandler;
    let mockSessionManager: Partial<ZoweSessionManager>;
    let mockTelemetry: Partial<TelemetryService>;
    let mockStream: Partial<vscode.ChatResponseStream>;

    beforeEach(() => {
        mockSessionManager = {};
        mockTelemetry = {
            trackSuccess: jest.fn(),
            trackError: jest.fn(),
        };
        mockStream = {
            progress: jest.fn(),
            markdown: jest.fn(),
        };
        handler = new TsoHandler(
            mockSessionManager as ZoweSessionManager,
            mockTelemetry as TelemetryService
        );
    });

    it('should create TsoHandler instance', () => {
        expect(handler).toBeDefined();
        expect(handler).toBeInstanceOf(TsoHandler);
    });

    it('should return a ZosChatResult with command "tso"', async () => {
        const request = { prompt: 'do something' } as vscode.ChatRequest;
        const result = await handler.handle(
            request,
            {} as vscode.ChatContext,
            mockStream as vscode.ChatResponseStream,
            {} as vscode.CancellationToken
        );

        expect(result.metadata.command).toBe('tso');
    });

    it('should call stream.markdown with stub message', async () => {
        const request = { prompt: '' } as vscode.ChatRequest;
        await handler.handle(
            request,
            {} as vscode.ChatContext,
            mockStream as vscode.ChatResponseStream,
            {} as vscode.CancellationToken
        );

        expect(mockStream.markdown).toHaveBeenCalled();
        const content = (mockStream.markdown as jest.Mock).mock.calls[0][0] as string;
        expect(content).toContain('/tso');
    });

    it('should return followup suggestions', async () => {
        const request = { prompt: '' } as vscode.ChatRequest;
        const result = await handler.handle(
            request,
            {} as vscode.ChatContext,
            mockStream as vscode.ChatResponseStream,
            {} as vscode.CancellationToken
        );

        expect(result.metadata.followups.length).toBeGreaterThan(0);
        expect(result.metadata.followups[0].label).toBeDefined();
        expect(result.metadata.followups[0].prompt).toBeDefined();
    });

    it('should return undefined intentType for stub', async () => {
        const request = { prompt: 'test' } as vscode.ChatRequest;
        const result = await handler.handle(
            request,
            {} as vscode.ChatContext,
            mockStream as vscode.ChatResponseStream,
            {} as vscode.CancellationToken
        );

        expect(result.metadata.intentType).toBeUndefined();
    });
});

describe('UssHandler', () => {
    let handler: UssHandler;
    let mockSessionManager: Partial<ZoweSessionManager>;
    let mockTelemetry: Partial<TelemetryService>;
    let mockStream: Partial<vscode.ChatResponseStream>;

    beforeEach(() => {
        mockSessionManager = {};
        mockTelemetry = {
            trackSuccess: jest.fn(),
            trackError: jest.fn(),
        };
        mockStream = {
            progress: jest.fn(),
            markdown: jest.fn(),
        };
        handler = new UssHandler(
            mockSessionManager as ZoweSessionManager,
            mockTelemetry as TelemetryService
        );
    });

    it('should create UssHandler instance', () => {
        expect(handler).toBeDefined();
        expect(handler).toBeInstanceOf(UssHandler);
    });

    it('should return a ZosChatResult with command "uss"', async () => {
        const request = { prompt: 'do something' } as vscode.ChatRequest;
        const result = await handler.handle(
            request,
            {} as vscode.ChatContext,
            mockStream as vscode.ChatResponseStream,
            {} as vscode.CancellationToken
        );

        expect(result.metadata.command).toBe('uss');
    });

    it('should call stream.markdown with stub message', async () => {
        const request = { prompt: '' } as vscode.ChatRequest;
        await handler.handle(
            request,
            {} as vscode.ChatContext,
            mockStream as vscode.ChatResponseStream,
            {} as vscode.CancellationToken
        );

        expect(mockStream.markdown).toHaveBeenCalled();
        const content = (mockStream.markdown as jest.Mock).mock.calls[0][0] as string;
        expect(content).toContain('/uss');
    });

    it('should return followup suggestions', async () => {
        const request = { prompt: '' } as vscode.ChatRequest;
        const result = await handler.handle(
            request,
            {} as vscode.ChatContext,
            mockStream as vscode.ChatResponseStream,
            {} as vscode.CancellationToken
        );

        expect(result.metadata.followups.length).toBeGreaterThan(0);
    });

    it('should return undefined intentType for stub', async () => {
        const request = { prompt: 'test' } as vscode.ChatRequest;
        const result = await handler.handle(
            request,
            {} as vscode.ChatContext,
            mockStream as vscode.ChatResponseStream,
            {} as vscode.CancellationToken
        );

        expect(result.metadata.intentType).toBeUndefined();
    });
});
