import * as React from 'react';
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Nav from "./components/Navigation";
import Home from "./pages/home";
import Schedule from "./pages/schedule";
import Cabinet from "./pages/cabinet";
import Planner from "./pages/planner";
import Stats from "./pages/stats";
import './styles/global.scss';

const LayoutWithNav = () => {
    const location = useLocation();
    const [blobs, setBlobs] = useState<Array<{top?: string, left?: string, bottom?: string, right?: string}>>([]);
    const getRandomPercentage = () => Math.floor(Math.random() * 80) + 10;
    useEffect(() => {
        const newBlobs = Array.from({ length: 6 }).map((_, i) => {
            if (i % 2 === 0) {
                return { top: `${getRandomPercentage()}%`, left: `${getRandomPercentage()}%` };
            } else {
                return { bottom: `${getRandomPercentage()}%`, right: `${getRandomPercentage()}%` };
            }
        });
        setBlobs(newBlobs);
    }, [location]);

    return (
        <div className="dashboard-layout">
            <Nav />

            <main className="main-content">
                {blobs.map((style, index) => (
                    <div 
                        key={index} 
                        className={`blob blob-${index % 2 === 0 ? 'even' : 'odd'}`} 
                        style={style}
                    ></div>
                ))}

                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/schedule" element={<Schedule />} />
                    <Route path="/cabinet" element={<Cabinet />} />
                    <Route path="/planner" element={<Planner />} />
                    <Route path="/stats" element={<Stats />} />
                </Routes>
            </main>
        </div>
    );
};

export default function App() {
    return (
        <BrowserRouter>
            <LayoutWithNav />
        </BrowserRouter>
    );
}
