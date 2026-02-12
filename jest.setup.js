/* global beforeAll, afterEach, afterAll, jest */
import "@testing-library/jest-native/extend-expect";
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { mockApiServer, resetMockApiState } from './test-harness';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

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
