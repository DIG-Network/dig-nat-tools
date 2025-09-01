// bob.js - Bob's client on a different machine
const Gun = require('gun');
require('gun/sea');
const readline = require('readline');

// Connect to remote relay
const gun = Gun({
  peers: ['http://nostalgiagame.go.ro:30878/gun']
});

// Create readline interface for chat
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Reference to the chat room
const chat = gun.get('chatroom');

// Bob's user info
const bob = {
  name: 'Bob',
  id: Gun.text.random()
};

console.log('=== Bob\'s Chat Client ===');
console.log('Connected to relay at nostalgiagame.go.ro:30878');
console.log('Your ID:', bob.id);
console.log('Type messages and press Enter to send');
console.log('Type "exit" to quit\n');

// Listen for messages
chat.map().on((message, id) => {
  if (message && message.text && message.sender && message.timestamp) {
    // Don't show our own messages again
    if (message.senderId !== bob.id) {
      const time = new Date(message.timestamp).toLocaleTimeString();
      console.log(`\n[${time}] ${message.sender}: ${message.text}`);
      rl.prompt();
    }
  }
});

// Function to send message
function sendMessage(text) {
  const message = {
    text: text,
    sender: bob.name,
    senderId: bob.id,
    timestamp: Date.now()
  };
  
  // Put message in the chat
  chat.get(Gun.text.random()).put(message);
  console.log(`You: ${text}`);
}

// Handle user input
rl.on('line', (input) => {
  input = input.trim();
  
  if (input.toLowerCase() === 'exit') {
    console.log('Goodbye!');
    process.exit();
  } else if (input) {
    sendMessage(input);
  }
  
  rl.prompt();
});

// Initial prompt
rl.setPrompt('> ');
rl.prompt();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nDisconnecting...');
  process.exit();
});