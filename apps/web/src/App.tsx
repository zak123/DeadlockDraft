import { Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';
import { ApiDocs } from './pages/ApiDocs';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lobby/:code" element={<Lobby />} />
      <Route path="/docs/api" element={<ApiDocs />} />
    </Routes>
  );
}

export default App;
