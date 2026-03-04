/* global beforeAll, afterEach, afterAll, jest */
import "@testing-library/jest-native/extend-expect";
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { mockApiServer, resetMockApiState } from './test-harness';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
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
