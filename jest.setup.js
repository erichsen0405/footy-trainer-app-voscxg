/* global beforeAll, afterEach, afterAll, jest */
import "@testing-library/jest-native/extend-expect";
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import WebSocket from 'ws';
import { mockApiServer, resetMockApiState } from './test-harness';

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, accessPrivileges: 'all' }),
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
}));
jest.mock('expo-av', () => {
  class MockSound {
    loadAsync = jest.fn().mockResolvedValue(undefined);
    replayAsync = jest.fn().mockResolvedValue(undefined);
    setPositionAsync = jest.fn().mockResolvedValue(undefined);
    playAsync = jest.fn().mockResolvedValue(undefined);
    unloadAsync = jest.fn().mockResolvedValue(undefined);
  }

  return {
    Audio: {
      Sound: MockSound,
      setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    },
  };
});

beforeAll(() => {
  mockApiServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  mockApiServer.resetHandlers();
  resetMockApiState();
});

afterAll(() => {
  mockApiServer.close();
});
