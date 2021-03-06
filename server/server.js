const express = require('express');
const path = require('path')
const http = require('http');
const socketIo = require('socket.io');
const _ = require('lodash');

const port = process.env.PORT || 4001;
const app = express();

app.use(express.static(path.join(__dirname, '..', 'build')));

app.get('/*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});

const server = http.createServer(app);
const io = socketIo(server);

const ROW_COUNT = 50;
const COLUMN_COUNT = 50;

const UP = 'u';
const DOWN = 'd';
const LEFT = 'l';
const RIGHT = 'r';

const ALL_COLORS = ['red', 'black', 'purple', 'green', 'pink', 'blue', 'yellow', 'orange', 'brown'];
const colorMap = {
  1: 'red',
  2: 'black',
  3: 'purple',
  4: 'green'
};
let teamColorMap = {};

const activeColors = {};

const sharedPlayerState = {
  direction: RIGHT,
  alive: true,
};

const getInitialPlayerState = () => ({
  [colorMap[1]]: {
    position: {
      x: 15,
      y: 15,
    },
    ...sharedPlayerState,
  },
  [colorMap[2]]: {
    position: {
      x: 15,
      y: 35,
    },
    ...sharedPlayerState,
  },
  [colorMap[3]]: {
    position: {
      x: 35,
      y: 15,
    },
    ...sharedPlayerState,
  },
  [colorMap[4]]: {
    position: {
      x: 35,
      y: 35,
    },
    ...sharedPlayerState,
  },
});
const getPossibleColors = () => [colorMap[1], colorMap[2], colorMap[3], colorMap[4]];

const getPositionKey = (x, y) => {
  return `${x}:${y}`;
}

const getStartPositions = () => _.reduce(getInitialPlayerState(), (acc, val, key) => {
  acc[getPositionKey(val.position.x, val.position.y)] = key;
  return acc;
}, {});

let playerState = getInitialPlayerState();

const getInitialScores = () => _.reduce(getInitialPlayerState(), (acc, _val, key) => {
  acc[key] = 0;
  return acc;
}, {});

let scores = getInitialScores();

const getInitialBoard = () => _.times(COLUMN_COUNT, (x) => (_.times(ROW_COUNT, (y) => {
  const positionKey = getPositionKey(x, y);
  const startPositions = getStartPositions();
  if (startPositions[positionKey]) {
    return startPositions[positionKey];
  }
  return null;
})));

let board = getInitialBoard();

let newPositions = {};

let gameInit;

const getGameStateAndEmit = () => {
  const { gameIsActive, winner } = getGameStatus();
  if (winner && winner !== 'DRAW' && gameInit) {
    _.forEach(winner, w => {
      scores[w] = scores[w] + 1;
    });
  }
  if (!gameIsActive) {
    gameInit = null;
  }
  const seconds = gameInit
    ? Math.round(3 - (new Date().getTime() - gameInit.getTime()) / 1000)
    : null;
  if (seconds !== null && seconds <= 0) {
    playerState = { ...playerState,
      ..._.reduce(Object.values(activeColors), (acc, color) => {
        acc[color] = getNewPlayerState(board, playerState[color], color);
        return acc;
      }, {}),
    };

    _.forEach(newPositions, (val, _key) => {
      if (val.length > 1) {
        _.forEach(val, (color) => {
          playerState[color].alive = false;
        });
      }
    });

    newPositions = {};
  }
  board = getBoard(gameIsActive);
  io.emit('GameState', {
    board,
    countdown: seconds >= 0 ? seconds : 0,
    gameIsActive,
    winner,
    scores: getActiveScores(),
    teams: teamColorMap,
  });
};

setInterval(getGameStateAndEmit, 50);

const resetActiveColors = () => {
  const activeConnections = Object.keys(io.sockets.sockets);
  _.forEach(Object.keys(activeColors), connection => {
    if (!activeConnections.includes(connection)) {
      const oldColor = activeColors[connection];
      delete activeColors[connection];
      teamColorMap = {};
      playerState[oldColor] = getInitialPlayerState()[oldColor];
    }
  });
};

io.on('connection', (socket) => {
  resetActiveColors();
  let colorObtained = false;
  const selectedColors = Object.values(activeColors);
  _.forEach(getPossibleColors(), color => {
    if (!selectedColors.includes(color)) {
      colorObtained = true;
      activeColors[socket.id] = color;
      io.to(socket.id).emit('PlayerColor', color);
      return false;
    }
  });
  emitAvailableColors();
  if (!colorObtained) {
    return;
  }
  socket.on('disconnect', () => {
    resetActiveColors();
    emitAvailableColors();
  });
  socket.on('StartGame', handleStartGame);
  socket.on('EndGame', handleEndGame);
  socket.on('KeyDown', handleKeyDown);
  socket.on('SelectColor', (color) => handleSelectColor(socket, color));
  socket.on('SelectTeammate', (color) => handleSelectTeammate(socket, color));
  socket.on('GetAvailableColors', emitAvailableColors);
});

const emitAvailableColors = () => {
  io.emit('AvailableColors', _.xor(Object.values(activeColors), ALL_COLORS));
};

const handleSelectTeammate = (socket, color) => {
  if (_.size(activeColors) < 4
      || _.find(scores, (val, _key) => val > 0)) {
    return;
  }
  const playerColor = activeColors[socket.id];
  teamColorMap[1] = [playerColor, color];
  teamColorMap[2] = _.without(Object.values(activeColors), ...teamColorMap[1]);
};

const handleSelectColor = (socket, color) => {
  if (gameInit === null) {
    const oldColor = activeColors[socket.id];
    if (color === oldColor) {
      return;
    }
    const oldKey = _.findKey(colorMap, (val, _key) => {
      return val === oldColor;
    });
    colorMap[oldKey] = color;
    activeColors[socket.id] = color;
    const oldPlayerState = playerState[oldColor];
    playerState[color] = oldPlayerState;
    delete playerState[oldColor];
    const oldScore = scores[oldColor];
    scores[color] = oldScore;
    delete scores[oldColor];
    if (!_.isEmpty(teamColorMap)) {
      teamColorMap[1] = _.map(teamColorMap[1], c => c === oldColor ? color : c);
      teamColorMap[2] = _.map(teamColorMap[2], c => c === oldColor ? color : c);
    }
    io.to(socket.id).emit('PlayerColor', color);
  }
};

const handleStartGame = () => {
  if (!_.size(activeColors) >= 2) {
    return;
  }
  playerState = getInitialPlayerState();
  board = getInitialBoard();
  gameInit = new Date();
};

const handleEndGame = () => {
  playerState = getInitialPlayerState();
  board = getInitialBoard();
  scores = getInitialScores();
  teamColorMap = {};
};

const handleKeyDown = ({ key, color }) => {
  switch(key) {
    case UP:
      playerState = { ...playerState,
        [color]: {
          ...playerState[color],
          direction: UP,
        }
      };
      break;
    case DOWN:
      playerState = { ...playerState,
        [color]: {
          ...playerState[color],
          direction: DOWN,
        }
      };
      break;
    case LEFT:
      playerState = { ...playerState,
        [color]: {
          ...playerState[color],
          direction: LEFT,
        }
      };
      break;
    case RIGHT:
      playerState = { ...playerState,
        [color]: {
          ...playerState[color],
          direction: RIGHT,
        }
      };
      break;
    default:
  }
};

const getNewPlayerState = (board, player, color) => {
  const { position, direction, alive, ...rest } = player;
  if (!alive) {
    return {
      position,
      direction,
      alive,
      ...rest,
    };
  }

  const newPosition = ((d) => {
    switch(d) {
      case UP:
        return {
          x: position.x,
          y: position.y - 1,
        };
      case DOWN:
        return {
          x: position.x,
          y: position.y + 1,
        };
      case LEFT:
        return {
          x: position.x - 1,
          y: position.y,
        };
      case RIGHT:
        return {
          x: position.x + 1,
          y: position.y,
        };
      default:
        return {
          x: position.x,
          y: position.y,
        };
    }
  })(direction);

  if (Object.values(activeColors).includes(color)) {
    const newPositionKey = getPositionKey(newPosition.x, newPosition.y);
    newPositions[newPositionKey] = newPositions[newPositionKey]
      ? [...newPositions[newPositionKey], color]
      : [color];
  }
  
  const newAlive = newPosition.x < COLUMN_COUNT && newPosition.y < ROW_COUNT
    && newPosition.x >= 0 && newPosition.y >= 0
    && !board[newPosition.x][newPosition.y];

  return {
    position: newAlive ? newPosition : position,
    direction,
    alive: newAlive,
    ...rest,
  };
};

const getBoard = (gameIsActive) => {
  const selectedColors = Object.values(activeColors);
  const colorPositions = _.reduce(selectedColors, (acc, color) => {
    acc[color] = playerState[color].position;
    return acc;
  }, {});
  const startPositions = getStartPositions();
  return _.times(COLUMN_COUNT, (x) => (_.times(ROW_COUNT, (y) => {
    const newColor = _.find(selectedColors, color => {
      return colorPositions[color].x === x && colorPositions[color].y === y;
    });

    if (board[x][y]) {
      if (gameIsActive && newColor && !startPositions[getPositionKey(x, y)]) {
        return 'grey';
      }
      const color = board[x][y];
      if (selectedColors.includes(color) || color === 'grey') {
        return color;
      } else {
        return null;
      }
    }

    return newColor;
  })));
};

const getWinner = (alivePlayers) => {
  if (_.isEmpty(alivePlayers)) {
    return 'DRAW';
  }
  return alivePlayers;
};

const getGameStatus = () => {
  let gameIsActive;
  let winner;
  if (!_.isEmpty(teamColorMap)) {
    const teamOneAlive = _.filter(Object.values(teamColorMap[1]), color => playerState[color].alive);
    const teamTwoAlive = _.filter(Object.values(teamColorMap[2]), color => playerState[color].alive);
    gameIsActive = !_.isEmpty(teamOneAlive) && !_.isEmpty(teamTwoAlive);
    let winners;
    if (!_.isEmpty(teamOneAlive)) {
      winners = Object.values(teamColorMap[1]);
    }
    if (!_.isEmpty(teamTwoAlive)) {
      winners = Object.values(teamColorMap[2]);
    }
    winner = gameIsActive ? null : getWinner(winners);
  } else {
    const alivePlayers = _.filter(Object.values(activeColors), color => playerState[color].alive);
    gameIsActive = _.size(alivePlayers) > 1;
    winner = gameIsActive || _.size(activeColors) < 2 ? null : getWinner(alivePlayers);
  }
  return { gameIsActive, winner };
};

const getActiveScores = () => {
  const selectedColors = Object.values(activeColors);
  return _.pickBy(scores, (_value, key) => {
    return selectedColors.includes(key);
  });
};

server.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

module.exports = app;
