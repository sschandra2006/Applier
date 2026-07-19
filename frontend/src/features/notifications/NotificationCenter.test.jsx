import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import NotificationCenter from './NotificationCenter';

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({
      success: true,
      data: [
        { _id: '1', title: 'Test Alert', message: 'This is a test', type: 'INFO', read: false }
      ]
    })
  })
);

describe('NotificationCenter Component', () => {
  it('renders the bell icon', async () => {
    await act(async () => {
      render(<NotificationCenter />);
    });
    // Simple test to check if the component mounts without crashing
    expect(document.querySelector('button')).not.toBeNull();
  });
});
