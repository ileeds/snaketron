import { useEffect, useState } from 'react';
import socketIOClient from 'socket.io-client';

const socket = socketIOClient('http://127.0.0.1:4001');

const useSocketGameState = () => {
  const [response, setResponse] = useState({});

  useEffect(() => {
    socket.on('GameState', data => {
      setResponse(data);
    });

    return () => socket.disconnect();
  }, []);

  return response;
};

const useSocketPlayerColor = () => {
  const [response, setResponse] = useState();

  useEffect(() => {
    socket.on('PlayerColor', data => {
      setResponse(data);
    });

    return () => socket.disconnect();
  }, []);

  return response;
};

const emitStartGame = () => {
  socket.emit('StartGame');
}

const emitKeyDown = (key, color) => {
  socket.emit('KeyDown', { key, color });
};

export {
  useSocketGameState,
  useSocketPlayerColor,
  emitStartGame,
  emitKeyDown,
};
