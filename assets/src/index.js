/** @jsx h */
import { h, render } from 'preact';
import { ChatPanel } from './components.jsx';
import './styles.css';

const root = document.getElementById('roundtable-app');
if (root) render(h(ChatPanel, {}), root);
