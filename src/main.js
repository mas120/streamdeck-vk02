import { installDiagnostics } from './core/diagnostics.js';
import './core/grid.js';
import './styles/index.css';
import { bootstrapApp } from './core/app.js';

installDiagnostics();
bootstrapApp();
