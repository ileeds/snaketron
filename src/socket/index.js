import { useEffect, useState } from 'react';
import socketIOClient from 'socket.io-client';

const socket = socketIOClient(process.env.NODE_ENV === 'development'
  ? 'localhost:4001'
  : 'https://bmtron.herokuapp.com');

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
};

const emitEndGame = () => {
  socket.emit('EndGame');
};

const emitKeyDown = (key, color) => {
  socket.emit('KeyDown', { key, color });
};

export {
  useSocketGameState,
  useSocketPlayerColor,
  emitStartGame,
  emitEndGame,
  emitKeyDown,
};
