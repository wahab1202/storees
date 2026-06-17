// Storees deploy pipeline.
//
// Assumes Jenkins runs on (or can shell into) the server where the two checkouts
// live, and that each checkout is already cloned and on the right branch. It just
// pulls + builds + restarts via scripts/deploy.sh, which fails hard on a bad build
// and frees the port before restart (so no half-built / EADDRINUSE-zombie state).
//
// Adjust the `environment` block per box:
//   GWM box  (goweldev): BACKEND_DIR=/var/www/html/storees-backend  API_NAME=storees-api  WEB_NAME=storees-web
//   main box (storees):  BACKEND_DIR=/var/www/html/storees_backend  API_NAME=storees-backend WEB_NAME=storees-frontend
//
// If Jenkins runs on a different host, wrap the `sh` steps in `ssh <server> '...'`
// (or use the SSH Agent / Publish-Over-SSH plugin) and keep the same commands.

pipeline {
  agent any

  parameters {
    booleanParam(name: 'DEPLOY_BACKEND',  defaultValue: true,  description: 'Deploy the API/backend')
    booleanParam(name: 'DEPLOY_FRONTEND', defaultValue: true,  description: 'Deploy the web/frontend')
  }

  environment {
    BACKEND_DIR  = '/var/www/html/storees-backend'
    FRONTEND_DIR = '/var/www/html/storees-frontend'
    API_NAME     = 'storees-api'
    API_PORT     = '4000'
    WEB_NAME     = 'storees-web'
    WEB_PORT     = '4001'
  }

  options {
    timestamps()
    disableConcurrentBuilds()   // never two deploys racing on the same port
  }

  stages {
    stage('Deploy backend') {
      when { expression { params.DEPLOY_BACKEND } }
      steps {
        sh '''
          cd "$BACKEND_DIR"
          bash scripts/deploy.sh backend "$API_NAME" "$API_PORT"
        '''
      }
    }

    stage('Deploy frontend') {
      when { expression { params.DEPLOY_FRONTEND } }
      steps {
        sh '''
          cd "$FRONTEND_DIR"
          bash scripts/deploy.sh frontend "$WEB_NAME" "$WEB_PORT"
        '''
      }
    }
  }

  post {
    failure {
      echo '✗ Deploy failed — the previous process is left running (build aborts before restart). Check the stage log.'
    }
    success {
      echo '✓ Deploy complete.'
    }
  }
}
