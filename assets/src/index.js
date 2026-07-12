import { h, render } from 'preact';
import './styles.css';

const root = document.getElementById('roundtable-app');
if (root) {
  render(h('div', { class: 'rt-panel', style: 'padding:20px' }, 'Roundtable UI loaded.'), root);
}
