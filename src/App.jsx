import { Routes, Route } from 'react-router-dom';
import Home from './pages/home/home.jsx';
import CreateSchedule from './pages/create/CreateSchedule.jsx';
import SharedSchedules from './pages/shared/SharedSchedules.jsx';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateSchedule />} />
        <Route path="/shared" element={<SharedSchedules />} />
      </Routes>
    </>
  );
}

export default App;