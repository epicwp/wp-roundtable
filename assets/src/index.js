/** @jsx h */
import { h, render } from 'preact';
import { CommunityApp } from './community-app.jsx';
import './styles.css';

const root = document.getElementById('roundtable-app');
if (root) render(h(CommunityApp, {}), root);
