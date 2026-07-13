import {
  CXO_ROOM,
  PGM_ROOM,
  emitFieldOverridden,
  emitProjectPublished,
  registerSocketHandlers,
} from '../realtime';

function makeMockIo() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  const on = jest.fn();
  const use = jest.fn();
  return { io: { to, on, use }, to, emit, use };
}

describe('Realtime Socket.io layer', () => {
  it('joins Program Managers and CXOs to their review rooms on connect', () => {
    const { io } = makeMockIo();
    registerSocketHandlers(io as never);

    const connectionHandler = (io.on as jest.Mock).mock.calls[0][1];
    const pgmSocket = { handshake: { query: { role: 'program_manager' } }, join: jest.fn() };
    const cxoSocket = { handshake: { query: { role: 'cxo' } }, join: jest.fn() };
    const pmSocket = { handshake: { query: { role: 'pm' } }, join: jest.fn() };
    const pmWithUserSocket = {
      handshake: { query: { role: 'pm' } },
      data: { role: 'pm', userId: 'user-pm-123' },
      join: jest.fn()
    };

    connectionHandler(pgmSocket);
    connectionHandler(cxoSocket);
    connectionHandler(pmSocket);
    connectionHandler(pmWithUserSocket);

    expect(pgmSocket.join).toHaveBeenCalledWith(PGM_ROOM);
    expect(cxoSocket.join).toHaveBeenCalledWith(CXO_ROOM);
    expect(pmSocket.join).not.toHaveBeenCalled();
    expect(pmWithUserSocket.join).toHaveBeenCalledWith('pm:user-pm-123');
  });

  it('emits project.published to Program Manager and CXO rooms', () => {
    const { io, to, emit } = makeMockIo();
    registerSocketHandlers(io as never);

    emitProjectPublished({
      id: 'sub-1',
      project_id: 'proj-1',
      submitted_by: 'pm-1',
      version: 2,
      updated_at: '2026-04-30T08:00:00Z',
    });

    expect(to).toHaveBeenCalledWith(PGM_ROOM);
    expect(to).toHaveBeenCalledWith(CXO_ROOM);
    expect(emit).toHaveBeenCalledWith('project.published', {
      project_id: 'proj-1',
      submission_id: 'sub-1',
      submitted_by: 'pm-1',
      version: 2,
      published_at: '2026-04-30T08:00:00Z',
    });
  });

  it('emits field.overridden to Program Manager and CXO rooms', () => {
    const { io, to, emit } = makeMockIo();
    registerSocketHandlers(io as never);

    const payload = {
      submission_id: 'sub-1',
      field_name: 'rag_schedule',
      original_value: 'green',
      override_value: 'red',
      override_reason: 'Escalated client dependency',
      overridden_by: 'pgm-1',
      created_at: '2026-04-30T08:05:00Z',
    };
    emitFieldOverridden(payload);

    expect(to).toHaveBeenCalledWith(PGM_ROOM);
    expect(to).toHaveBeenCalledWith(CXO_ROOM);
    expect(emit).toHaveBeenCalledWith('field.overridden', payload);
  });
});
