import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('App', () => {
  it('renders a single monitor shell without duplicated top tab navigation', () => {
    render(<App />);

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByText('MONITOR')).not.toBeInTheDocument();
    expect(screen.queryByText('TELEMETRY')).not.toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: '상단 제어 바' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Primary monitor area' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '카메라 연결' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '센서 연결' })).toBeInTheDocument();
  });
});
