import './App.css';
import { Show, SignInButton, UserButton } from '@clerk/react';

function App() {
  return (
    <div id="center">
      <h1>Hello World</h1>
      
      <Show when="signed-out">
        <SignInButton mode="modal" />
      </Show>

      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  );
}

export default App;